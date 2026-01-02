import { z } from 'zod';
import type { RegisterableModule } from '../registry/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sampleText, tryParseJson } from './_ai.js';

type Supplement = {
  name: string;
  category: string;
  purpose: string;
  dosage: string;
  timing: string;
  caution?: string;
  priority: '필수' | '권장' | '선택';
};

const GOAL_NAMES: Record<string, string> = {
  muscleGain: '근비대',
  fatLoss: '체지방 감소',
  boxingSkill: '복싱 기술',
  endurance: '지구력',
  recovery: '피로 회복',
};

function getBaseSupplements(goal: string): Array<Supplement> {
  const base: Array<Supplement> = [
    {
      name: '종합 비타민',
      category: '기초 영양',
      purpose: '전반적인 영양 균형',
      dosage: '1정',
      timing: '아침 식사 후',
      priority: '필수',
    },
    {
      name: '오메가-3',
      category: '심혈관 건강',
      purpose: '염증 감소, 심장 건강',
      dosage: '1000-2000mg (EPA+DHA 기준)',
      timing: '식사와 함께',
      priority: '필수',
    },
  ];

  if (goal === 'muscleGain') {
    base.push(
      {
        name: '유청 단백질 (Whey Protein) (유당 포함)',
        category: '단백질',
        purpose: '근육 합성 촉진',
        dosage: '20-30g',
        timing: '운동 직후 30분 이내',
        priority: '필수',
      },
      {
        name: '유청 단백질 (Whey Protein Isolate) (유당 제거)',
        category: '단백질',
        purpose: '근육 합성 촉진, 유당 제거',
        dosage: '20-30g (더 높은 함량, 유당 제거)',
        timing: '운동 직후 30분 이내',
        priority: '선택',
      },
      {
        name: '크레아틴 모노하이드레이트',
        category: '근력 향상',
        purpose: '근력/파워 증가, 근비대 촉진',
        dosage: '3-5g',
        timing: '운동 전후 또는 아침',
        priority: '권장',
      },
      {
        name: 'BCAA (분지 사슬 아미노산)',
        category: '근육 회복',
        purpose: '근손실 방지, 회복 촉진',
        dosage: '5-10g',
        timing: '운동 중 또는 직후',
        priority: '선택',
      },
      {
        name: 'EAA (필수 아미노산)',
        category: '근육 회복',
        purpose: '근육 합성 촉진, 근손실 방지, 회복 촉진',
        dosage: '7-15g',
        timing: '운동 전/중/후',
        priority: '권장',
      }
    );
  } else if (goal === 'fatLoss') {
    base.push(
      {
        name: 'L-카르니틴',
        category: '지방 연소',
        purpose: '지방을 에너지로 전환',
        dosage: '1000-2000mg',
        timing: '운동 30분 전',
        priority: '권장',
      },
      {
        name: '녹차 추출물 (EGCG)',
        category: '대사 촉진',
        purpose: '신진대사 증가',
        dosage: '300-500mg',
        timing: '아침/점심',
        caution: '카페인 민감자 주의',
        priority: '선택',
      }
    );
  } else if (goal === 'boxingSkill' || goal === 'endurance') {
    base.push(
      {
        name: '베타 알라닌',
        category: '지구력',
        purpose: '젖산 축적 지연, 지구력 향상',
        dosage: '3-6g',
        timing: '운동 30분 전',
        caution: '얼굴 따끔거림 정상 반응',
        priority: '권장',
      },
      {
        name: '전해질 보충제',
        category: '수분/전해질',
        purpose: '땀으로 손실된 미네랄 보충',
        dosage: '운동 강도에 따라',
        timing: '운동 중',
        priority: '권장',
      }
    );
  }

  return base;
}

function getRecoverySupplements(): Supplement[] {
  return [
    {
      name: '마그네슘',
      category: '피로 회복/수면',
      purpose: '근육 이완, 수면 질 개선, 피로 감소',
      dosage: '300-400mg',
      timing: '저녁 식사 후 또는 취침 1시간 전',
      priority: '권장',
    },
    {
      name: '아연',
      category: '면역/호르몬',
      purpose: '면역력 강화, 테스토스테론 지원',
      dosage: '15-30mg',
      timing: '저녁 (공복 또는 식후)',
      caution: '공복 시 속 쓰림 가능, 식후 권장',
      priority: '선택',
    },
    {
      name: '비타민 D3',
      category: '면역/뼈',
      purpose: '면역력, 뼈 건강, 기분 개선',
      dosage: '2000-4000 IU',
      timing: '아침 식사 후 (지용성 비타민)',
      priority: '권장',
    },
    {
      name: '타트 체리 추출물',
      category: '회복/수면',
      purpose: '근육통 감소, 수면 질 개선',
      dosage: '480mg',
      timing: '운동 후 또는 취침 1시간 전',
      priority: '선택',
    },
    {
      name: '아쉬와간다',
      category: '스트레스/회복',
      purpose: '스트레스 감소, 코르티솔 조절',
      dosage: '300-600mg',
      timing: '저녁 또는 취침 전',
      caution: '임신/수유 중 피하기',
      priority: '선택',
    },
  ];
}

function getJointSupplements(): Array<Supplement> {
  return [
    {
      name: '글루코사민 + 콘드로이틴',
      category: '관절 건강',
      purpose: '연골 보호, 관절 통증 완화',
      dosage: '글루코사민 1500mg + 콘드로이틴 1200mg',
      timing: '식사와 함께 (분할 가능)',
      priority: '필수',
    },
    {
      name: 'MSM (메틸설포닐메탄)',
      category: '관절/염증',
      purpose: '관절 염증 감소',
      dosage: '1000-3000mg',
      timing: '아침/저녁 식사 후',
      priority: '권장',
    },
    {
      name: '콜라겐 펩타이드',
      category: '관절/피부',
      purpose: '관절 연골 재생',
      dosage: '10-15g',
      timing: '아침 공복',
      priority: '선택',
    },
  ];
}

const supplementModule: RegisterableModule = {
  type: 'tool',
  name: 'supplement_recommendations',
  description: '운동 목표와 건강 상태에 맞는 영양제를 추천합니다. 복용 타이밍, 용량, 주의사항, 월 예상 비용 포함.',
  register(server: McpServer): void {
    server.tool(
      'supplement_recommendations',
      '영양제 추천 (목표별, 건강 상태별, 예산별)',
      {
        goal: z.enum(['muscleGain', 'fatLoss', 'boxingSkill', 'endurance', 'recovery']).describe(`[필수] 운동 목표를 선택하세요:
  • muscleGain - 근비대 (벌크업, 근육 증가)
  • fatLoss - 체지방 감소 (다이어트)
  • boxingSkill - 복싱 기술 (격투기, 고강도)
  • endurance - 지구력 (마라톤, 장거리)
  • recovery - 피로 회복 (오버트레이닝 회복)
  예시: muscleGain`),

        trainingFrequency: z.number().min(2).max(7).describe('[필수] 주당 운동 횟수를 숫자로 입력 (2~7). 예시: 4 (주 5회 이상이면 회복 영양제 자동 추가)'),

        hasJointIssue: z.boolean().describe('[필수] 관절 부상/통증 여부 (true: 무릎/어깨/허리 등 문제 있음 / false: 문제 없음)'),

        needsRecovery: z.boolean().describe('[필수] 피로 회복 필요 여부 (true: 피로 누적, 수면 부족, 회복 느림 / false: 컨디션 양호)'),

        budget: z.enum(['low', 'medium', 'high']).optional().describe(`[선택] 예산 수준 (기본값: medium):
  • low - 기초 필수 영양제만 (월 3-5만원)
  • medium - 필수+권장 영양제 (월 7-12만원)
  • high - 전체 추천 (월 15-25만원)
  예시: medium`),

        aiAssist: z.boolean().optional().describe('[선택] AI 보조로 복용 스케줄/구매 체크리스트/주의사항을 보강합니다. (기본 false)'),
        aiDetail: z.enum(['brief', 'standard', 'detailed']).optional().describe('[선택] AI 설명 길이 (기본 standard)'),
        profile: z
          .object({
            age: z.number().min(10).max(90).optional().describe('[선택] 나이'),
            sex: z.enum(['male', 'female', 'other']).optional().describe('[선택] 성별'),
            diet: z.enum(['omnivore', 'vegetarian', 'vegan']).optional().describe('[선택] 식단'),
            allergies: z.array(z.string()).optional().describe('[선택] 알레르기(예: "유당", "갑각류")'),
            medications: z.array(z.string()).optional().describe('[선택] 복용 약(예: "혈압약")'),
            conditions: z.array(z.string()).optional().describe('[선택] 기저질환(예: "당뇨", "위염")'),
          })
          .optional()
          .describe('[선택] 개인 정보(민감정보는 최소로 입력). AI가 “설명/주의사항”에만 반영, 추천 목록 자체는 고정 룰 기반.'),
      },
      async (args): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
        const { goal, trainingFrequency, hasJointIssue, needsRecovery, budget = 'medium', aiAssist = false, aiDetail = 'standard', profile } = args;

        let supplements = getBaseSupplements(goal);

        if (hasJointIssue) {
          supplements = supplements.concat(getJointSupplements());
        }

        if (needsRecovery || trainingFrequency >= 5) {
          supplements = supplements.concat(getRecoverySupplements());
        }

        if (budget === 'low') {
          supplements = supplements.filter((s) => s.priority === '필수');
        } else if (budget === 'medium') {
          supplements = supplements.filter((s) => s.priority !== '선택');
        }

        const priorityOrder: Record<string, number> = { 필수: 1, 권장: 2, 선택: 3 };
        supplements.sort((a, b) => priorityOrder[a.priority]! - priorityOrder[b.priority]!);

        const warnings = [
          '⚠️ 영양제는 식사 대체 불가. 균형 잡힌 식단이 최우선입니다.',
          '💊 처음 복용 시 권장 용량의 절반부터 시작해 부작용 확인하세요.',
          '🏥 기저 질환(당뇨, 고혈압 등)이나 약 복용 중이면 의사와 상담 필수.',
          '💰 고가 제품보다 꾸준한 복용이 효과적입니다. 최소 3개월 유지 권장.',
          '📦 제품 구매 시 성분 함량, 첨가물, 인증(GMP, HACCP) 확인하세요.',
        ];

        if (hasJointIssue) {
          warnings.push('🦴 관절 영양제는 최소 3개월 이상 꾸준히 복용해야 효과 체감 가능.');
        }

        if (trainingFrequency >= 5) {
          warnings.push('💪 고빈도 훈련 시 충분한 수면(7-9시간)과 단백질(체중 1kg당 2g) 필수.');
        }

        const budgetMap: Record<string, string> = {
          low: '기초 (필수만)',
          medium: '중간 (필수+권장)',
          high: '프리미엄 (전체)',
        };

        const costMap: Record<string, string> = {
          low: '3-5만원',
          medium: '7-12만원',
          high: '15-25만원',
        };

        const base = {
          목표: GOAL_NAMES[goal],
          주간_운동_횟수: `주 ${trainingFrequency}회`,
          관절_상태: hasJointIssue ? '문제 있음 (관절 영양제 포함)' : '정상',
          피로_상태: needsRecovery ? '피로 누적 (회복 영양제 포함)' : '양호',
          예산_수준: budgetMap[budget],
          추천_영양제_개수: supplements.length,
          추천_영양제: supplements,
          주의사항: warnings,
          월_예상_비용: costMap[budget],
        };

        if (!aiAssist) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(base, null, 2),
              },
            ],
          };
        }

        const detailHint = aiDetail === 'brief' ? '아주 짧게' : aiDetail === 'detailed' ? '상세하게' : '적당히';
        const systemPrompt =
          '너는 한국어 영양/운동 보조 코치다. 의학적 진단/처방은 하지 말고, 약 복용/기저질환/임신수유 등은 의료진 상담을 권한다. 제품 효능을 과장하지 말고, 서버가 제공한 추천 목록(성분/종류)을 벗어난 새로운 영양제를 추가 추천하지 마라.';

        const userText =
          `아래는 서버가 생성한 "고정 추천 목록(JSON)"이다. 추천 목록 자체(영양제 종류/용량/타이밍)는 바꾸지 말고, ${detailHint}로 다음을 만들어줘:\n` +
          `- 하루 복용 스케줄(아침/점심/운동 전후/취침)\n` +
          `- 구매 체크리스트(함량/인증/첨가물/가성비)\n` +
          `- profile(알레르기/약/질환)가 있으면 주의사항만 더 강화\n\n` +
          `사용자 프로필(있으면 반영): ${JSON.stringify(profile ?? {}, null, 2)}\n\n` +
          `고정 추천 목록(JSON):\n${JSON.stringify(base, null, 2)}\n\n` +
          `출력은 반드시 JSON 하나로만:\n` +
          `{\n` +
          `  "schedule": [{"time":"아침|점심|운동전|운동후|저녁|취침","items":["영양제명"],"note":"짧은 팁"}],\n` +
          `  "buyChecklist": ["체크리스트 5~10개"],\n` +
          `  "cautionsExtra": ["추가 주의사항(있을 때만)"],\n` +
          `  "oneLine": "한 줄 요약"\n` +
          `}\n`;

        const sampled = await sampleText({ server, systemPrompt, userText, maxTokens: aiDetail === 'detailed' ? 1200 : 800, temperature: 0 });

        if (!sampled.ok) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    ...base,
                    aiAssist: { enabled: true, ok: false, reason: sampled.reason, message: sampled.message },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const parsed = tryParseJson<{
          schedule: Array<{ time: string; items: string[]; note?: string }>;
          buyChecklist: string[];
          cautionsExtra?: string[];
          oneLine: string;
        }>(sampled.text);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ...base,
                  aiAssist: {
                    enabled: true,
                    ok: true,
                    model: sampled.model,
                    notes: parsed.ok ? parsed.value : { rawText: sampled.text },
                  },
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

export default supplementModule;
