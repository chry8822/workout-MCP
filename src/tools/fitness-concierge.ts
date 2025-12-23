import { z } from 'zod';
import type { RegisterableModule } from '../registry/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fetchJson } from './_http.js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`환경변수 ${name} 가(이) 설정되지 않았습니다. (.env 또는 호스팅 환경변수 확인)`);
  }
  return v.trim();
}

function stripHtml(input: string): string {
  return input.replaceAll(/<[^>]*>/g, '').replaceAll(/\s+/g, ' ').trim();
}

async function naverShopTop3(query: string): Promise<Array<{ title: string; price: number; link: string; mall?: string }>> {
  const id = requireEnv('NAVER_CLIENT_ID');
  const secret = requireEnv('NAVER_CLIENT_SECRET');

  const url = new URL('https://openapi.naver.com/v1/search/shop.json');
  url.searchParams.set('query', query);
  url.searchParams.set('display', '10');
  url.searchParams.set('start', '1');
  url.searchParams.set('sort', 'asc'); // 일반인용: 일단 최저가 우선

  const json = (await fetchJson(url.toString(), {
    headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
    timeoutMs: 9000,
  })) as any;

  const items: any[] = Array.isArray(json.items) ? json.items : [];
  return items
    .map((it) => ({
      title: stripHtml(String(it.title ?? '')),
      price: Number(it.lprice ?? 0),
      link: String(it.link ?? ''),
      mall: typeof it.mallName === 'string' ? it.mallName : undefined,
    }))
    .filter((x) => x.title && x.link && Number.isFinite(x.price) && x.price > 0)
    .slice(0, 3);
}

async function kakaoNearby(location: string, radiusM: number, keywords: string[]): Promise<any[]> {
  const key = requireEnv('KAKAO_REST_API_KEY');

  // geocode (address -> coord; fallback keyword)
  let x: number | undefined;
  let y: number | undefined;
  {
    const u = new URL('https://dapi.kakao.com/v2/local/search/address.json');
    u.searchParams.set('query', location);
    const json = (await fetchJson(u.toString(), {
      headers: { Authorization: `KakaoAK ${key}` },
      timeoutMs: 9000,
    })) as any;
    const doc = Array.isArray(json.documents) ? json.documents[0] : undefined;
    x = doc?.x ? Number(doc.x) : undefined;
    y = doc?.y ? Number(doc.y) : undefined;
  }
  if (x === undefined || y === undefined) {
    const u = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    u.searchParams.set('query', location);
    u.searchParams.set('size', '1');
    const json = (await fetchJson(u.toString(), {
      headers: { Authorization: `KakaoAK ${key}` },
      timeoutMs: 9000,
    })) as any;
    const doc = Array.isArray(json.documents) ? json.documents[0] : undefined;
    x = doc?.x ? Number(doc.x) : undefined;
    y = doc?.y ? Number(doc.y) : undefined;
  }
  if (x === undefined || y === undefined) {
    throw new Error('카카오에서 위치를 찾지 못했습니다. 예: "강남역", "OO동", "OO로 123" 로 다시 입력해 주세요.');
  }

  const results: any[] = [];
  for (const kw of keywords) {
    const u = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    u.searchParams.set('query', kw);
    u.searchParams.set('x', String(x));
    u.searchParams.set('y', String(y));
    u.searchParams.set('radius', String(radiusM));
    u.searchParams.set('sort', 'distance');
    u.searchParams.set('size', '10');

    const json = (await fetchJson(u.toString(), {
      headers: { Authorization: `KakaoAK ${key}` },
      timeoutMs: 9000,
    })) as any;

    const docs: any[] = Array.isArray(json.documents) ? json.documents : [];
    for (const p of docs) {
      const name = String(p.place_name ?? '');
      const px = String(p.x ?? '');
      const py = String(p.y ?? '');
      const encoded = encodeURIComponent(name);
      results.push({
        keyword: kw,
        name,
        distanceM: p.distance ? Number(p.distance) : undefined,
        address: p.road_address_name || p.address_name,
        phone: p.phone,
        placeUrl: p.place_url,
        mapUrl: `https://map.kakao.com/link/map/${encoded},${py},${px}`,
        toUrl: `https://map.kakao.com/link/to/${encoded},${py},${px}`,
      });
    }
  }

  const seen = new Set<string>();
  return results
    .filter((r) => {
      const k = `${r.name}|${r.address ?? ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.distanceM ?? 1e12) - (b.distanceM ?? 1e12))
    .slice(0, 7);
}

const conciergeModule: RegisterableModule = {
  type: 'tool',
  name: 'fitness-concierge',
  description: '일반인용 원샷 도구: 영양제 가격비교 + 근처 gym 찾기',
  register(server: McpServer) {
    server.tool(
      'find_supplement_deals_and_nearby_gyms',
      '한 번에 해결: 영양제(네이버쇼핑) Top3 + 근처 헬스장/복싱장(카카오) Top7을 찾아 링크까지 제공합니다.',
      {
        supplementQuery: z.string().min(1).describe('[필수] 영양제/제품 검색어 (예: "크레아틴 모노하이드레이트 500g")'),
        location: z.string().min(1).describe('[필수] 기준 위치 (예: "강남역", "OO동", "OO로 123")'),
        radiusM: z.number().min(100).max(20000).optional().describe('[선택] 반경(미터) 기본 2000'),
        gymKeywords: z.array(z.string().min(1)).optional().describe('[선택] 시설 키워드 (기본: ["헬스장","복싱장","크로스핏"])'),
      },
      async (args) => {
        const radiusM = args.radiusM ?? 2000;
        const gymKeywords = args.gymKeywords?.length ? args.gymKeywords : ['헬스장', '복싱장', '크로스핏'];

        const [products, gyms] = await Promise.all([
          naverShopTop3(args.supplementQuery),
          kakaoNearby(args.location, radiusM, gymKeywords),
        ]);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  input: args,
                  supplementTop3: products,
                  nearbyGymsTop7: gyms,
                  nextActions: [
                    '원하는 상품이 있으면 link를 열고, 용량/옵션/배송비를 확인하세요.',
                    '마음에 드는 체육관이 있으면 toUrl로 길찾기를 열고, phone으로 문의해 시설(샤워/주차/24시)을 확인하세요.',
                  ],
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

export default conciergeModule;


