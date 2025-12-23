import { z } from 'zod';
import type { RegisterableModule } from '../registry/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fetchJson, safeString } from './_http.js';

type NaverShopItem = {
  title: string;
  link: string;
  image?: string;
  lprice: number;
  hprice?: number;
  mallName?: string;
  brand?: string;
  maker?: string;
  category1?: string;
  category2?: string;
  category3?: string;
  category4?: string;
  productId?: string;
  productType?: string;
};

function stripHtml(input: string): string {
  return input
    .replaceAll(/<[^>]*>/g, '')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .trim();
}

function toInt(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

type Amount = { value: number; unit: 'g' | 'kg' | 'mg' | 'ml' | 'l' | 'capsule' | 'tablet' | 'serving' };

function normalizeAmountToBase(amount: Amount): { baseValue: number; baseUnit: 'g' | 'ml' | 'count' | 'serving' } {
  switch (amount.unit) {
    case 'g':
      return { baseValue: amount.value, baseUnit: 'g' };
    case 'kg':
      return { baseValue: amount.value * 1000, baseUnit: 'g' };
    case 'mg':
      return { baseValue: amount.value / 1000, baseUnit: 'g' };
    case 'ml':
      return { baseValue: amount.value, baseUnit: 'ml' };
    case 'l':
      return { baseValue: amount.value * 1000, baseUnit: 'ml' };
    case 'capsule':
    case 'tablet':
      return { baseValue: amount.value, baseUnit: 'count' };
    case 'serving':
      return { baseValue: amount.value, baseUnit: 'serving' };
  }
}

function extractFirstAmount(title: string): Amount | undefined {
  const t = title.toLowerCase().replaceAll(/,/g, '').replaceAll(/\s+/g, ' ').trim();

  // Examples:
  // 500g, 1kg, 3000mg, 120캡슐, 60정, 30회분, 1l, 500ml
  const patterns: Array<{ re: RegExp; unit: Amount['unit'] }> = [
    { re: /(\d+(?:\.\d+)?)\s*(kg)\b/, unit: 'kg' },
    { re: /(\d+(?:\.\d+)?)\s*(g)\b/, unit: 'g' },
    { re: /(\d+(?:\.\d+)?)\s*(mg)\b/, unit: 'mg' },
    { re: /(\d+(?:\.\d+)?)\s*(l)\b/, unit: 'l' },
    { re: /(\d+(?:\.\d+)?)\s*(ml)\b/, unit: 'ml' },
    { re: /(\d+)\s*(캡슐)\b/, unit: 'capsule' },
    { re: /(\d+)\s*(정)\b/, unit: 'tablet' },
    { re: /(\d+)\s*(회분)\b/, unit: 'serving' },
    { re: /(\d+)\s*(servings?)\b/, unit: 'serving' },
    { re: /(\d+)\s*(capsules?)\b/, unit: 'capsule' },
    { re: /(\d+)\s*(tablets?)\b/, unit: 'tablet' },
  ];

  for (const p of patterns) {
    const m = t.match(p.re);
    if (!m) continue;
    const value = Number(m[1]);
    if (!Number.isFinite(value) || value <= 0) continue;
    return { value, unit: p.unit };
  }

  return undefined;
}

function extractMultiplier(title: string): number {
  const t = title.toLowerCase().replaceAll(/\s+/g, ' ');
  // Examples: x2, 2개, 3팩, 2box
  const patterns: RegExp[] = [/x\s*(\d+)\b/, /(\d+)\s*개\b/, /(\d+)\s*팩\b/, /(\d+)\s*box\b/, /(\d+)\s*박스\b/];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 1 && n <= 50) return n;
  }
  return 1;
}

function computeUnitPrice(lprice: number, title: string): { unitPrice?: number; unitLabel?: string; amount?: Amount } {
  const cleanTitle = stripHtml(title);
  const amount = extractFirstAmount(cleanTitle);
  const multiplier = extractMultiplier(cleanTitle);

  if (!amount) return {};
  const { baseValue, baseUnit } = normalizeAmountToBase(amount);
  const total = baseValue * multiplier;
  if (!Number.isFinite(total) || total <= 0) return {};

  const unitPrice = lprice / total;
  if (!Number.isFinite(unitPrice)) return {};

  const unitLabel = baseUnit === 'g' ? '원/ g' : baseUnit === 'ml' ? '원/ ml' : baseUnit === 'count' ? '원/ 개' : '원/ 회분';

  return { unitPrice, unitLabel, amount };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`환경변수 ${name} 가(이) 설정되지 않았습니다. (.env 또는 호스팅 환경변수 확인)`);
  }
  return v.trim();
}

async function naverShopSearch(opts: {
  query: string;
  display: number;
  start: number;
  sort: 'sim' | 'date' | 'asc' | 'dsc';
}): Promise<{ items: NaverShopItem[]; meta: unknown }> {
  const id = requireEnv('NAVER_CLIENT_ID');
  const secret = requireEnv('NAVER_CLIENT_SECRET');

  const url = new URL('https://openapi.naver.com/v1/search/shop.json');
  url.searchParams.set('query', opts.query);
  url.searchParams.set('display', String(opts.display));
  url.searchParams.set('start', String(opts.start));
  url.searchParams.set('sort', opts.sort);

  const json = await fetchJson(url.toString(), {
    headers: {
      'X-Naver-Client-Id': id,
      'X-Naver-Client-Secret': secret,
    },
    timeoutMs: 9000,
  });

  const obj = json as Record<string, unknown>;
  const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
  const items: NaverShopItem[] = itemsRaw
    .map((it) => {
      const r = it as Record<string, unknown>;
      const lprice = toInt(r.lprice) ?? 0;
      const hprice = toInt(r.hprice);
      return {
        title: safeString(r.title ?? ''),
        link: safeString(r.link ?? ''),
        image: typeof r.image === 'string' ? r.image : undefined,
        lprice,
        hprice: hprice && hprice > 0 ? hprice : undefined,
        mallName: typeof r.mallName === 'string' ? r.mallName : undefined,
        brand: typeof r.brand === 'string' ? r.brand : undefined,
        maker: typeof r.maker === 'string' ? r.maker : undefined,
        category1: typeof r.category1 === 'string' ? r.category1 : undefined,
        category2: typeof r.category2 === 'string' ? r.category2 : undefined,
        category3: typeof r.category3 === 'string' ? r.category3 : undefined,
        category4: typeof r.category4 === 'string' ? r.category4 : undefined,
        productId: typeof r.productId === 'string' ? r.productId : undefined,
        productType: typeof r.productType === 'string' ? r.productType : undefined,
      };
    })
    .filter((it) => it.title.length > 0 && it.link.length > 0 && it.lprice > 0);

  return { items, meta: { total: obj.total, lastBuildDate: obj.lastBuildDate } };
}

const naverShoppingModule: RegisterableModule = {
  type: 'tool',
  name: 'naver-shopping',
  description: '네이버 쇼핑 검색/가격 비교 도구',
  register(server: McpServer) {
    server.tool(
      'naver_shop_search',
      '네이버 쇼핑에서 상품을 검색합니다. (일반인용: "크레아틴 최저가", "오메가3 rTG" 처럼 입력)',
      {
        query: z.string().min(1).describe('[필수] 검색어 (예: "크레아틴 500g")'),
        sort: z.enum(['sim', 'date', 'asc', 'dsc']).optional().describe('[선택] 정렬 (sim=유사도, date=최신, asc=낮은가격, dsc=높은가격) 기본 sim'),
        display: z.number().min(1).max(30).optional().describe('[선택] 결과 개수(1~30) 기본 10'),
        start: z.number().min(1).max(1000).optional().describe('[선택] 시작 위치(1~1000) 기본 1'),
        minPrice: z.number().min(0).optional().describe('[선택] 이 가격 미만은 제외'),
        maxPrice: z.number().min(0).optional().describe('[선택] 이 가격 초과는 제외'),
        includeWords: z.array(z.string().min(1)).optional().describe('[선택] 제목에 반드시 포함되어야 하는 단어들'),
        excludeWords: z.array(z.string().min(1)).optional().describe('[선택] 제목에 포함되면 제외할 단어들'),
      },
      async (args) => {
        const { query, sort = 'sim', display = 10, start = 1, minPrice, maxPrice, includeWords, excludeWords } = args;

        const { items, meta } = await naverShopSearch({ query, display, start, sort });

        const filtered = items.filter((it) => {
          if (minPrice !== undefined && it.lprice < minPrice) return false;
          if (maxPrice !== undefined && it.lprice > maxPrice) return false;
          const title = stripHtml(it.title).toLowerCase();
          if (includeWords?.length) {
            for (const w of includeWords) if (!title.includes(w.toLowerCase())) return false;
          }
          if (excludeWords?.length) {
            for (const w of excludeWords) if (title.includes(w.toLowerCase())) return false;
          }
          return true;
        });

        const summarized = filtered.slice(0, Math.min(filtered.length, display)).map((it) => {
          const cleanTitle = stripHtml(it.title);
          const unit = computeUnitPrice(it.lprice, it.title);
          return {
            title: cleanTitle,
            price: it.lprice,
            mall: it.mallName,
            link: it.link,
            unitPrice: unit.unitPrice ? Math.round(unit.unitPrice * 100) / 100 : undefined,
            unitLabel: unit.unitLabel,
          };
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  query,
                  meta,
                  results: summarized,
                  note: 'unitPrice는 제목에서 용량(예: 500g/120캡슐/30회분)을 추정해 계산한 값입니다. 표시가 없으면 단가 계산이 어려운 상품입니다.',
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    server.tool(
      'naver_shop_price_compare',
      '네이버 쇼핑 검색 결과에서 “최저가 + (가능하면) 단가(원/g, 원/캡슐, 원/회분)” 기준으로 Top N을 뽑습니다.',
      {
        query: z.string().min(1).describe('[필수] 검색어 (예: "크레아틴 모노하이드레이트")'),
        topN: z.number().min(1).max(10).optional().describe('[선택] 추천 개수(1~10) 기본 3'),
        preferUnit: z.enum(['g', 'ml', 'count', 'serving', 'auto']).optional().describe('[선택] 단가 기준 (기본 auto)'),
        sort: z.enum(['sim', 'date', 'asc', 'dsc']).optional().describe('[선택] 네이버 정렬 기본 sim'),
        display: z.number().min(5).max(30).optional().describe('[선택] 내부 검색 개수(5~30) 기본 20'),
      },
      async (args) => {
        const { query, topN = 3, preferUnit = 'auto', sort = 'sim', display = 20 } = args;
        const { items, meta } = await naverShopSearch({ query, display, start: 1, sort });

        const scored = items
          .map((it) => {
            const cleanTitle = stripHtml(it.title);
            const unit = computeUnitPrice(it.lprice, it.title);
            const amount = unit.amount ? normalizeAmountToBase(unit.amount) : undefined;
            const unitType = amount?.baseUnit;
            const unitOk =
              preferUnit === 'auto'
                ? true
                : preferUnit === 'g'
                ? unitType === 'g'
                : preferUnit === 'ml'
                ? unitType === 'ml'
                : preferUnit === 'count'
                ? unitType === 'count'
                : unitType === 'serving';

            return {
              title: cleanTitle,
              price: it.lprice,
              mall: it.mallName,
              link: it.link,
              unitPrice: unit.unitPrice,
              unitLabel: unit.unitLabel,
              unitType,
              unitOk,
            };
          })
          .filter((x) => x.price > 0)
          .sort((a, b) => {
            // Prefer unitPrice when available and matching preferUnit; otherwise fallback to price.
            const aHas = a.unitPrice !== undefined && a.unitOk;
            const bHas = b.unitPrice !== undefined && b.unitOk;
            if (aHas && bHas) return (a.unitPrice ?? 0) - (b.unitPrice ?? 0);
            if (aHas) return -1;
            if (bHas) return 1;
            return a.price - b.price;
          });

        const top = scored.slice(0, topN).map((x) => ({
          title: x.title,
          price: x.price,
          unitPrice: x.unitPrice ? Math.round(x.unitPrice * 100) / 100 : undefined,
          unitLabel: x.unitLabel,
          mall: x.mall,
          link: x.link,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  query,
                  meta,
                  top,
                  note: '단가 계산은 “상품명에 적힌 용량/수량”을 기반으로 추정합니다. 정확한 1회분 기준은 제품 상세페이지를 확인하세요.',
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

export default naverShoppingModule;
