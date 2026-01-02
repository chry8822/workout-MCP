import { z } from 'zod';
import type { RegisterableModule } from '../registry/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sampleText, tryParseJson } from './_ai.js';

// 타입 정의
type ExerciseItem = {
  name: string;
  sets?: number;
  reps?: string | number;
  rounds?: number;
  duration?: string;
  pace?: string;
  restSec?: number;
  tip?: string;
};

type WorkoutPlan = {
  warmup: string;
  day: string;
  category: string;
  exercises: ExerciseItem[];
  cooldown?: string;
};

const GOAL_NAMES: Record<string, string> = {
  fatLoss: '체지방 감소',
  muscleGain: '근비대',
  boxingSkill: '복싱 기술 향상',
  endurance: '지구력 강화',
};

const LEVEL_NAMES: Record<string, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '상급',
};

// 근비대 루틴 생성 함수들
function createChestWorkout(level: string): WorkoutPlan {
  const exercises =
    level === 'beginner'
      ? [
          { name: '푸시업', sets: 3, reps: '10-15', restSec: 60, tip: '무릎 대고 해도 OK' },
          { name: '덤벨 플라이', sets: 3, reps: '12-15', restSec: 60 },
          { name: '머신 체스트 프레스', sets: 3, reps: '12-15', restSec: 60 },
        ]
      : level === 'intermediate'
      ? [
          { name: '바벨 벤치프레스', sets: 4, reps: '8-10', restSec: 90 },
          { name: '인클라인 덤벨프레스', sets: 3, reps: '10-12', restSec: 60 },
          { name: '딥스', sets: 3, reps: '10-12', restSec: 60 },
          { name: '케이블 크로스오버', sets: 3, reps: '12-15', restSec: 45 },
        ]
      : [
          { name: '바벨 벤치프레스', sets: 5, reps: '5-8', restSec: 120, tip: '고중량' },
          { name: '인클라인 바벨 프레스', sets: 4, reps: '8-10', restSec: 90 },
          { name: '덤벨 플라이', sets: 4, reps: '10-12', restSec: 60 },
          { name: '웨이티드 딥스', sets: 3, reps: '8-12', restSec: 75 },
          { name: '케이블 크로스오버', sets: 3, reps: '15', restSec: 45 },
        ];

  return {
    day: '월요일',
    category: '가슴 + 삼두',
    warmup: '밴드 숄더 워밍업, 가벼운 푸시업 15회 또는 팩덱 플라이 20회씩 3세트',
    exercises,
    cooldown: '가슴 스트레칭 3분',
  };
}

function createBackWorkout(level: string): WorkoutPlan {
  const exercises =
    level === 'beginner'
      ? [
          { name: '랫풀다운', sets: 3, reps: '12-15', restSec: 60 },
          { name: '시티드 로우', sets: 3, reps: '12-15', restSec: 60 },
          { name: '덤벨 로우', sets: 3, reps: 12, restSec: 45 },
        ]
      : level === 'intermediate'
      ? [
          { name: '데드리프트', sets: 4, reps: '6-8', restSec: 120, tip: '허리 중립' },
          { name: '풀업', sets: 3, reps: '8-10', restSec: 90 },
          { name: '바벨 로우', sets: 3, reps: '10-12', restSec: 60 },
          { name: '페이스풀', sets: 3, reps: 15, restSec: 45 },
        ]
      : [
          { name: '데드리프트', sets: 5, reps: '5-6', restSec: 150 },
          { name: '웨이티드 풀업', sets: 4, reps: '6-8', restSec: 90 },
          { name: '벤트오버 바벨 로우', sets: 4, reps: '8-10', restSec: 75 },
          { name: 'T바 로우', sets: 3, reps: '10-12', restSec: 60 },
          { name: '스트레이트 암 풀다운', sets: 3, reps: '12-15', restSec: 45 },
        ];

  return {
    day: '수요일',
    category: '등 + 이두',
    warmup: '밴드 풀어파트,폼롤러 등 마사지 ,행잉 30초',
    exercises,
    cooldown: '광배근 스트레칭',
  };
}

function createLegsWorkout(level: string): WorkoutPlan {
  const exercises =
    level === 'beginner'
      ? [
          { name: '고블릿 스쿼트', sets: 3, reps: '12-15', restSec: 60 },
          { name: '레그프레스', sets: 3, reps: 15, restSec: 60 },
          { name: '레그컬', sets: 3, reps: '12-15', restSec: 45 },
          { name: '카프레이즈', sets: 3, reps: 20, restSec: 45 },
        ]
      : level === 'intermediate'
      ? [
          { name: '바벨 스쿼트', sets: 4, reps: '8-10', restSec: 120 },
          { name: '루마니안 데드리프트', sets: 3, reps: '10-12', restSec: 90 },
          { name: '레그프레스', sets: 3, reps: '12-15', restSec: 90 },
          { name: '레그 익스텐션', sets: 3, reps: '12-15', restSec: 60 },
          { name: '시티드 카프레이즈', sets: 4, reps: '15-20', restSec: 45 },
        ]
      : [
          { name: '바벨 백 스쿼트', sets: 5, reps: '5-8', restSec: 150 },
          { name: '프론트 스쿼트', sets: 4, reps: '8-10', restSec: 120 },
          { name: '루마니안 데드리프트', sets: 4, reps: '8-10', restSec: 90 },
          { name: '워킹 런지', sets: 3, reps: '각 12', restSec: 60 },
          { name: '레그컬', sets: 3, reps: '12-15', restSec: 60 },
          { name: '스탠딩 카프레이즈', sets: 5, reps: 15, restSec: 45 },
        ];

  return {
    day: '금요일',
    category: '하체',
    warmup: '에어 스쿼트 20회, 레그스윙 또는 레그 익스텐션 20회 3세트 ',
    exercises,
    cooldown: '하체 스트레칭 5분',
  };
}

function createShouldersWorkout(level: string): WorkoutPlan {
  const exercises =
    level === 'beginner'
      ? [
          { name: '덤벨 숄더 프레스', sets: 3, reps: '12-15', restSec: 60 },
          { name: '사이드 레터럴 레이즈', sets: 3, reps: 15, restSec: 45 },
          { name: '프론트 레이즈', sets: 3, reps: 12, restSec: 45 },
        ]
      : level === 'intermediate'
      ? [
          { name: '바벨 오버헤드 프레스', sets: 4, reps: '8-10', restSec: 90 },
          { name: '덤벨 사이드 레터럴', sets: 4, reps: '12-15', restSec: 60 },
          { name: '리어 델트 플라이', sets: 3, reps: '12-15', restSec: 45 },
          { name: '페이스풀', sets: 3, reps: 15, restSec: 45 },
        ]
      : [
          { name: '바벨 오버헤드 프레스', sets: 5, reps: '6-8', restSec: 120 },
          { name: '덤벨 숄더 프레스', sets: 4, reps: '8-10', restSec: 90 },
          { name: '사이드 레터럴 (드롭셋)', sets: 3, reps: '12/8/6', restSec: 60 },
          { name: '벤트오버 레터럴', sets: 4, reps: 12, restSec: 60 },
          { name: '업라이트 로우', sets: 3, reps: '10-12', restSec: 60 },
        ];

  return { day: '목요일', category: '어깨', warmup: '밴드 워밍업', exercises, cooldown: '어깨 스트레칭' };
}

function createArmsWorkout(level: string): WorkoutPlan {
  const exercises =
    level === 'beginner'
      ? [
          { name: '바벨 컬', sets: 3, reps: '12-15', restSec: 60 },
          { name: '해머 컬', sets: 3, reps: 12, restSec: 45 },
          { name: '트라이셉 푸시다운', sets: 3, reps: '12-15', restSec: 60 },
          { name: '오버헤드 익스텐션', sets: 3, reps: 12, restSec: 45 },
        ]
      : level === 'intermediate'
      ? [
          { name: 'EZ바 컬', sets: 4, reps: '10-12', restSec: 60 },
          { name: '인클라인 덤벨 컬', sets: 3, reps: '10-12', restSec: 60 },
          { name: '클로즈그립 벤치프레스', sets: 4, reps: '8-10', restSec: 90 },
          { name: '케이블 트라이셉 익스텐션', sets: 3, reps: '12-15', restSec: 45 },
        ]
      : [
          { name: '바벨 컬', sets: 4, reps: '8-10', restSec: 75 },
          { name: '프리처 컬', sets: 3, reps: '10-12', restSec: 60 },
          { name: '컨센트레이션 컬', sets: 3, reps: 12, restSec: 45 },
          { name: '딥스', sets: 4, reps: '8-12', restSec: 75 },
          { name: '스컬크러셔', sets: 3, reps: '10-12', restSec: 60 },
        ];

  return { day: '토요일', category: '팔', warmup: '밴드 컬/익스텐션', exercises };
}

function createBoxingWorkout(level: string): WorkoutPlan {
  const exercises =
    level === 'beginner'
      ? [
          { name: '줄넘기', rounds: 3, duration: '2분', restSec: 60 },
          { name: '섀도복싱', rounds: 3, duration: '2분', restSec: 60, tip: '기본 기술만' },
          { name: '샌드백', rounds: 4, duration: '2분', restSec: 90 },
          { name: '플랭크', sets: 3, duration: '30초', restSec: 30 },
        ]
      : level === 'intermediate'
      ? [
          { name: '줄넘기 인터벌', rounds: 5, duration: '3분', restSec: 60 },
          { name: '섀도복싱', rounds: 5, duration: '3분', restSec: 60 },
          { name: '샌드백 타격', rounds: 6, duration: '3분', restSec: 90 },
          { name: '미트치기', rounds: 4, duration: '2분', restSec: 60 },
          { name: '코어 서킷', sets: 3, reps: '각 20회', restSec: 45 },
        ]
      : [
          { name: '줄넘기 고강도', rounds: 6, duration: '3분', restSec: 45 },
          { name: '섀도복싱 (웨이트)', rounds: 6, duration: '3분', restSec: 60 },
          { name: '샌드백', rounds: 8, duration: '3분', restSec: 75 },
          { name: '미트치기', rounds: 6, duration: '3분', restSec: 60 },
          { name: '스파링', rounds: 4, duration: '3분', restSec: 120 },
        ];

  return { day: '화/목/토', category: '복싱 기술', warmup: '동적 스트레칭', exercises };
}

function createFatLossWorkout(level: string, hasGymAccess: boolean): WorkoutPlan {
  if (!hasGymAccess) {
    // 홈트 버전
    const exercises =
      level === 'beginner'
        ? [
            { name: '버피', sets: 3, reps: 10, restSec: 45 },
            { name: '마운틴클라이머', sets: 3, reps: 20, restSec: 30 },
            { name: '점프 스쿼트', sets: 3, reps: 15, restSec: 45 },
          ]
        : level === 'intermediate'
        ? [
            { name: '버피', sets: 4, reps: 15, restSec: 45 },
            { name: '마운틴클라이머', sets: 4, reps: 30, restSec: 30 },
            { name: '점프 스쿼트', sets: 4, reps: 15, restSec: 45 },
            { name: '플랭크 투 푸시업', sets: 3, reps: 10, restSec: 45 },
          ]
        : [
            { name: '버피', sets: 5, reps: 20, restSec: 45 },
            { name: '마운틴클라이머', sets: 5, reps: 40, restSec: 30 },
            { name: '점프 스쿼트', sets: 4, reps: 20, restSec: 45 },
            { name: '점프 런지', sets: 4, reps: '각 15', restSec: 45 },
            { name: '바이시클 크런치', sets: 4, reps: 40, restSec: 30 },
          ];

    return {
      day: '월/수/금',
      category: '홈 HIIT',
      warmup: '제자리 조깅 3분',
      exercises,
      cooldown: '스트레칭 5분',
    };
  }

  const exercises =
    level === 'beginner'
      ? [
          { name: '트레드밀 인터벌', duration: '20분', pace: '2분 빠르게 / 1분 걷기' },
          { name: '케틀벨 스윙', sets: 3, reps: 15, restSec: 60 },
          { name: '로잉머신', duration: '10분', pace: '중강도' },
        ]
      : level === 'intermediate'
      ? [
          { name: '줄넘기 인터벌', sets: 5, duration: '3분 on / 1분 rest' },
          { name: '배틀로프', sets: 4, duration: '30초', restSec: 45 },
          { name: '케틀벨 스윙', sets: 4, reps: 20, restSec: 60 },
          { name: '박스 점프', sets: 4, reps: 12, restSec: 60 },
          { name: '로잉머신', duration: '15분', pace: '인터벌' },
        ]
      : [
          { name: 'HIIT 사이클', duration: '30분', pace: '30초 스프린트 / 30초 회복' },
          { name: '배틀로프', sets: 6, duration: '40초', restSec: 30 },
          { name: '케틀벨 스내치', sets: 4, reps: '각 15', restSec: 60 },
          { name: '박스 점프', sets: 5, reps: 10, restSec: 75 },
          { name: '슬램볼', sets: 4, reps: 20, restSec: 45 },
        ];

  return {
    day: '월/수/금',
    category: '고강도 인터벌',
    warmup: '동적 스트레칭 5분',
    exercises,
    cooldown: '쿨다운 워킹 5분',
  };
}

// 지구력
function createEnduranceWorkout(level: string): WorkoutPlan {
  const exercises =
    level === 'beginner'
      ? [
          { name: '조깅', duration: '20-30분', pace: '대화 가능', tip: '심박수 120-130' },
          { name: '사이클', duration: '15분', pace: '편안한 속도' },
          { name: '바디웨이트 서킷', sets: 3, reps: '각 15회', restSec: 45 },
        ]
      : level === 'intermediate'
      ? [
          { name: '러닝', duration: '35-45분', pace: '템포런', tip: '심박수 140-150' },
          { name: '사이클 인터벌', duration: '25분', pace: '3분 빠르게 / 2분 천천히' },
          { name: '로잉머신', duration: '15분', pace: '중강도' },
          { name: '바디웨이트 서킷', sets: 4, reps: '각 20회', restSec: 30 },
        ]
      : [
          { name: '장거리 러닝', duration: '60-90분', pace: 'LSD', tip: '심박수 130-140' },
          { name: '인터벌 러닝', duration: '40분', pace: '5분 빠르게 / 2분 조깅' },
          { name: '사이클 힐 인터벌', duration: '30분' },
          { name: '로잉머신 HIIT', duration: '20분', pace: '500m 고강도 / 1분 회복' },
          { name: '복합 서킷', sets: 5, reps: '각 25회', restSec: 30 },
        ];

  return {
    day: '화/목/일',
    category: '지구력 + 심폐',
    warmup: '가벼운 조깅 5분',
    exercises,
    cooldown: '쿨다운 워킹 10분',
  };
}

// 목표별 루틴 생성
function generateWorkoutsByGoal(goal: string, hasGymAccess: boolean, experienceLevel: string, daysPerWeek: number, targetBodyParts?: string[]): WorkoutPlan[] {
  const workouts: WorkoutPlan[] = [];

  if (goal === 'muscleGain' && hasGymAccess) {
    const parts = targetBodyParts || ['chest', 'back', 'legs'];
    if (parts.includes('chest')) workouts.push(createChestWorkout(experienceLevel));
    if (parts.includes('back')) workouts.push(createBackWorkout(experienceLevel));
    if (parts.includes('legs') && daysPerWeek >= 3) workouts.push(createLegsWorkout(experienceLevel));
    if (parts.includes('shoulders') && daysPerWeek >= 4) workouts.push(createShouldersWorkout(experienceLevel));
    if (parts.includes('arms') && daysPerWeek >= 5) workouts.push(createArmsWorkout(experienceLevel));
  } else if (goal === 'boxingSkill') {
    workouts.push(createBoxingWorkout(experienceLevel));
  } else if (goal === 'fatLoss') {
    workouts.push(createFatLossWorkout(experienceLevel, hasGymAccess));
  } else if (goal === 'endurance') {
    workouts.push(createEnduranceWorkout(experienceLevel));
  }

  return workouts;
}

// 주의사항 생성
function generateCautions(level: string, goal: string): string[] {
  const base = [
    '⚠️ 관절 부상 주의: 무릎, 허리, 어깨 워밍업 필수',
    '💧 수분: 하루 2-3L 섭취',
    '😴 휴식: 같은 부위 48시간 간격',
    `🎯 레벨: ${LEVEL_NAMES[level]} - 무게 주당 2.5-5% 증가`,
  ];

  if (goal === 'muscleGain') {
    base.push('🍖 단백질: 체중 1kg당 1.6-2.2g');
    base.push('⏰ 수면: 7-9시간 필수');
  } else if (goal === 'fatLoss') {
    base.push('🔥 칼로리: 유지 칼로리 -300~500kcal');
    base.push('⚖️ 체중: 주당 0.5-1kg 감량 권장');
  } else if (goal === 'boxingSkill') {
    base.push('🥊 기술 우선: 폼이 먼저');
    base.push('🧘 유연성: 하체 스트레칭 중요');
  }

  return base;
}

// 메인 모듈
const workoutPlanModule: RegisterableModule = {
  type: 'tool',
  name: 'generate_workout_plan',
  description: '헬스/복싱 운동 루틴 생성',
  register(server: McpServer): void {
    server.tool(
      'generate_workout_plan',
      '운동 루틴을 생성합니다. 목표, 주당 운동 횟수, 숙련도, 헬스장 이용 여부를 선택하세요.',
      {
        goal: z.enum(['fatLoss', 'muscleGain', 'boxingSkill', 'endurance']).describe(`[필수] 운동 목표를 선택하세요:
    - fatLoss: 체지방 감소 (다이어트)
    - muscleGain: 근비대 (벌크업, 근육 증가)
    - boxingSkill: 복싱 기술 향상
    - endurance: 지구력 강화
    예시: muscleGain`),

        daysPerWeek: z.number().min(2).max(6).describe('[필수] 주당 운동 일수를 숫자로 입력하세요 (2~6 사이). 예시: 3'),

        experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).describe(`[필수] 운동 숙련도를 선택하세요:
    - beginner: 초급 (운동 경험 3개월 미만)
    - intermediate: 중급 (3개월~1년)
    - advanced: 상급 (1년 이상)
    예시: intermediate`),

        hasGymAccess: z.boolean().describe('[필수] 헬스장 이용 가능 여부 (true: 헬스장 가능 / false: 홈트레이닝)'),

        targetBodyParts: z.array(z.enum(['chest', 'back', 'legs', 'shoulders', 'arms', 'core'])).optional().describe(`[선택] 집중 훈련 부위 (여러 개 선택 가능):
    - chest: 가슴
    - back: 등
    - legs: 하체
    - shoulders: 어깨
    - arms: 팔
    - core: 코어
    예시: ["chest", "back"]`),

        aiAssist: z.boolean().optional().describe('[선택] AI 보조 설명/대체동작/진행 가이드를 추가합니다. (기본 false)'),
        aiDetail: z.enum(['brief', 'standard', 'detailed']).optional().describe('[선택] AI 설명 길이 (기본 standard)'),
        constraints: z
          .object({
            injuries: z.array(z.string()).optional().describe('[선택] 통증/부상(예: "어깨", "무릎")'),
            equipment: z.array(z.string()).optional().describe('[선택] 사용 가능한 장비(예: "덤벨", "밴드")'),
            timeLimitMin: z.number().min(10).max(120).optional().describe('[선택] 운동 가능 시간(분)'),
          })
          .optional()
          .describe('[선택] 개인 조건(AI가 설명/대체동작에만 반영, 루틴 구조는 유지)'),
      },
      async (args): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
        const { goal, daysPerWeek, experienceLevel, hasGymAccess, targetBodyParts, aiAssist = false, aiDetail = 'standard', constraints } = args;

        const workouts = generateWorkoutsByGoal(goal, hasGymAccess, experienceLevel, daysPerWeek, targetBodyParts);

        const base = {
          목표: GOAL_NAMES[goal],
          레벨: LEVEL_NAMES[experienceLevel],
          주간_운동_횟수: `주 ${daysPerWeek}회`,
          헬스장_이용: hasGymAccess ? '가능' : '홈트',
          운동_루틴: workouts,
          주의사항: generateCautions(experienceLevel, goal),
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
          '너는 한국어 피트니스 코치다. 사용자가 안전하게 수행할 수 있도록 설명하되, 의료 조언을 하지 말고 위험하면 전문의/트레이너 상담을 권한다.';

        const userText = `다음은 서버가 생성한 "고정 루틴(JSON)"이다. 이 루틴의 구조/운동명/세트/횟수는 바꾸지 말고, 설명(폼 포인트/대체 동작/진행 가이드)만 ${detailHint} 추가해줘.\n\n` +
          `사용자 조건(있으면 반영): ${JSON.stringify(constraints ?? {}, null, 2)}\n\n` +
          `고정 루틴(JSON):\n${JSON.stringify(base, null, 2)}\n\n` +
          `출력은 반드시 JSON 하나로만:\n` +
          `{\n` +
          `  "summary": "한 줄 요약",\n` +
          `  "formTips": ["폼/주의 포인트 3~7개"],\n` +
          `  "substitutions": [{"from":"원운동","to":"대체운동","when":"언제 대체하는지"}],\n` +
          `  "progression": ["2~4주 진행 가이드"],\n` +
          `  "safety": ["부상 예방/중단 기준"]\n` +
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
          summary: string;
          formTips: string[];
          substitutions: Array<{ from: string; to: string; when: string }>;
          progression: string[];
          safety: string[];
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

export default workoutPlanModule;
