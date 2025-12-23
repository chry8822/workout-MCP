import { z } from 'zod';
import type { RegisterableModule } from '../registry/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fetchJson, safeString } from './_http.js';

type KakaoPlace = {
  id: string;
  place_name: string;
  category_name?: string;
  phone?: string;
  address_name?: string;
  road_address_name?: string;
  place_url?: string;
  distance?: string;
  x: string; // lng
  y: string; // lat
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`환경변수 ${name} 가(이) 설정되지 않았습니다. (.env 또는 호스팅 환경변수 확인)`);
  }
  return v.trim();
}

function toNumber(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

async function kakaoGet<T>(url: URL): Promise<T> {
  const key = requireEnv('KAKAO_REST_API_KEY');
  const json = await fetchJson(url.toString(), {
    headers: {
      Authorization: `KakaoAK ${key}`,
    },
    timeoutMs: 9000,
  });
  return json as unknown as T;
}

async function geocodeTextToCoord(location: string): Promise<{ x: number; y: number; source: 'address' | 'keyword' }> {
  // 1) Address search
  {
    const url = new URL('https://dapi.kakao.com/v2/local/search/address.json');
    url.searchParams.set('query', location);
    const res = await kakaoGet<{ documents?: Array<Record<string, unknown>> }>(url);
    const doc = res.documents?.[0];
    const x = toNumber(doc?.x);
    const y = toNumber(doc?.y);
    if (x !== undefined && y !== undefined) return { x, y, source: 'address' };
  }

  // 2) Keyword search (e.g. "강남역")
  {
    const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    url.searchParams.set('query', location);
    url.searchParams.set('size', '1');
    const res = await kakaoGet<{ documents?: KakaoPlace[] }>(url);
    const doc = res.documents?.[0];
    const x = toNumber(doc?.x);
    const y = toNumber(doc?.y);
    if (x !== undefined && y !== undefined) return { x, y, source: 'keyword' };
  }

  throw new Error('위치(주소/장소)를 좌표로 변환하지 못했습니다. 예: "강남역", "OO구 OO동", "OO로 123" 형태로 다시 입력해 주세요.');
}

function buildKakaoMapLinks(placeName: string, y: string, x: string): { mapUrl: string; toUrl: string } {
  const encoded = encodeURIComponent(placeName);
  return {
    mapUrl: `https://map.kakao.com/link/map/${encoded},${y},${x}`,
    toUrl: `https://map.kakao.com/link/to/${encoded},${y},${x}`,
  };
}

const kakaoLocalModule: RegisterableModule = {
  type: 'tool',
  name: 'kakao-local',
  description: '카카오 로컬(장소검색/주소→좌표) 도구',
  register(server: McpServer) {
    server.tool(
      'kakao_geocode',
      '텍스트 위치(예: "강남역", "OO구 OO동", "OO로 123")를 위도/경도 좌표로 변환합니다.',
      {
        location: z.string().min(1).describe('[필수] 위치 텍스트'),
      },
      async (args) => {
        const coord = await geocodeTextToCoord(args.location);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ location: args.location, ...coord }, null, 2),
            },
          ],
        };
      }
    );

    server.tool(
      'kakao_place_search',
      '카카오에서 장소를 검색합니다. 좌표가 있으면 거리순 정렬이 가능합니다.',
      {
        query: z.string().min(1).describe('[필수] 검색어 (예: "강남역 헬스장")'),
        x: z.number().optional().describe('[선택] 경도(lng)'),
        y: z.number().optional().describe('[선택] 위도(lat)'),
        radiusM: z.number().min(0).max(20000).optional().describe('[선택] 반경(미터, 최대 20000)'),
        size: z.number().min(1).max(15).optional().describe('[선택] 결과 개수(1~15) 기본 10'),
      },
      async (args) => {
        const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
        url.searchParams.set('query', args.query);
        url.searchParams.set('size', String(args.size ?? 10));

        if (args.x !== undefined && args.y !== undefined) {
          url.searchParams.set('x', String(args.x));
          url.searchParams.set('y', String(args.y));
          url.searchParams.set('sort', 'distance');
          if (args.radiusM !== undefined) url.searchParams.set('radius', String(args.radiusM));
        }

        const res = await kakaoGet<{ documents?: KakaoPlace[] }>(url);
        const places = (res.documents ?? []).map((p) => {
          const links = buildKakaoMapLinks(p.place_name, p.y, p.x);
          return {
            id: p.id,
            name: p.place_name,
            category: p.category_name,
            phone: p.phone,
            address: p.road_address_name || p.address_name,
            distanceM: p.distance ? Number(p.distance) : undefined,
            x: p.x,
            y: p.y,
            placeUrl: p.place_url,
            mapUrl: links.mapUrl,
            toUrl: links.toUrl,
          };
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ query: args.query, results: places }, null, 2),
            },
          ],
        };
      }
    );

    server.tool(
      'kakao_find_nearby_gyms',
      '일반인용: "강남역 근처 헬스장/복싱장"처럼 입력하면 근처 운동 시설을 찾아줍니다. (시설 필터는 검색어에 반영되는 방식)',
      {
        location: z.string().min(1).describe('[필수] 기준 위치 (예: "강남역", "OO동")'),
        keywords: z.array(z.string().min(1)).optional().describe('[선택] 찾을 시설 키워드 목록 (기본: ["헬스장","복싱장","크로스핏"])'),
        radiusM: z.number().min(100).max(20000).optional().describe('[선택] 반경(미터) 기본 2000'),
        limit: z.number().min(1).max(15).optional().describe('[선택] 결과 개수(1~15) 기본 7'),
        filters: z
          .object({
            open24h: z.boolean().optional().describe('[선택] 24시(검색어에 반영)'),
            parking: z.boolean().optional().describe('[선택] 주차(검색어에 반영)'),
            shower: z.boolean().optional().describe('[선택] 샤워(검색어에 반영)'),
          })
          .optional()
          .describe('[선택] 시설 조건(정확한 필드가 없어 검색어 기반으로만 반영됩니다)'),
      },
      async (args) => {
        const keywords = args.keywords?.length ? args.keywords : ['헬스장', '복싱장', '크로스핏'];
        const radiusM = args.radiusM ?? 2000;
        const limit = args.limit ?? 7;

        const coord = await geocodeTextToCoord(args.location);
        const filterTokens: string[] = [];
        if (args.filters?.open24h) filterTokens.push('24시');
        if (args.filters?.parking) filterTokens.push('주차');
        if (args.filters?.shower) filterTokens.push('샤워');

        const results: Array<Record<string, unknown>> = [];

        for (const kw of keywords) {
          const q = [kw, ...filterTokens].join(' ');
          const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
          url.searchParams.set('query', q);
          url.searchParams.set('x', String(coord.x));
          url.searchParams.set('y', String(coord.y));
          url.searchParams.set('radius', String(radiusM));
          url.searchParams.set('sort', 'distance');
          url.searchParams.set('size', String(Math.min(15, Math.max(1, limit))));

          const res = await kakaoGet<{ documents?: KakaoPlace[] }>(url);
          for (const p of res.documents ?? []) {
            const links = buildKakaoMapLinks(p.place_name, p.y, p.x);
            results.push({
              keyword: kw,
              name: p.place_name,
              distanceM: p.distance ? Number(p.distance) : undefined,
              address: p.road_address_name || p.address_name,
              phone: p.phone,
              placeUrl: p.place_url,
              mapUrl: links.mapUrl,
              toUrl: links.toUrl,
              x: p.x,
              y: p.y,
            });
          }
        }

        // Deduplicate by (name + address) and sort by distance when available.
        const seen = new Set<string>();
        const deduped = results
          .filter((r) => {
            const key = `${safeString(r.name)}|${safeString(r.address)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => {
            const da = typeof a.distanceM === 'number' ? a.distanceM : Number.POSITIVE_INFINITY;
            const db = typeof b.distanceM === 'number' ? b.distanceM : Number.POSITIVE_INFINITY;
            return da - db;
          })
          .slice(0, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  location: args.location,
                  coord,
                  radiusM,
                  filtersAppliedAsQueryTokens: filterTokens,
                  results: deduped,
                  note: '샤워/주차/24시는 카카오가 구조화 필드로 제공하지 않는 경우가 많아 “검색어 기반”으로만 반영됩니다. 정확한 여부는 전화/상세페이지로 확인하세요.',
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );
  },
};

export default kakaoLocalModule;


