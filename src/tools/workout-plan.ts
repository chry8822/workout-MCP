import { z } from 'zod';
import type { RegisterableModule } from '../registry/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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
  day: string;
  category: string;
  exercises: ExerciseItem[];
};

// 한글 매핑 상수
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
  return {
    day: '월요일',
    category: '가슴 + 삼두',
    exercises: [
      { name: '바벨 벤치프레스', sets: level === 'beginner' ? 3 : 4, reps: '8-10', restSec: 90, tip: '천천히 내리고 폭발적으로 올리기' },
      { name: '인클라인 덤벨프레스', sets: 3, reps: '10-12', restSec: 60, tip: '가슴 상부 집중' },
      { name: '케이블 크로스오버', sets: 3, reps: '12-15', restSec: 45, tip: '수축 느끼기' },
      { name: '트라이셉 딥스', sets: 3, reps: '10-12', restSec: 60 },
    ],
  };
}

function createBackWorkout(level: string): WorkoutPlan {
  return {
    day: '수요일',
    category: '등 + 이두',
    exercises: [
      { name: '데드리프트', sets: level === 'beginner' ? 3 : 4, reps: '6-8', restSec: 120, tip: '허리 중립 유지, 코어 긴장' },
      { name: '풀업 (또는 랫풀다운)', sets: 3, reps: '8-10', restSec: 90 },
      { name: '바벨 로우', sets: 3, reps: '10-12', restSec: 60, tip: '등 하부까지 수축' },
      { name: '바벨 컬', sets: 3, reps: '10-12', restSec: 45 },
    ],
  };
}

function createLegsWorkout(): WorkoutPlan {
  return {
    day: '금요일',
    category: '하체',
    exercises: [
      { name: '바벨 스쿼트', sets: 4, reps: '8-10', restSec: 120, tip: '무릎 각도 90도, 발끝과 무릎 방향 일치' },
      { name: '레그프레스', sets: 3, reps: '12-15', restSec: 90 },
      { name: '레그컬', sets: 3, reps: '12-15', restSec: 60, tip: '햄스트링 집중' },
      { name: '카프레이즈', sets: 4, reps: '15-20', restSec: 45, tip: '종아리 최대 수축' },
    ],
  };
}

function createBoxingWorkout(): WorkoutPlan {
  return {
    day: '화/목/토',
    category: '복싱 기술 + 컨디셔닝',
    exercises: [
      { name: '웜업 - 줄넘기', rounds: 3, duration: '3분', restSec: 60, tip: '리듬감 유지' },
      { name: '섀도복싱', rounds: 5, duration: '3분', restSec: 60, tip: '풋워크 + 콤비네이션 연습' },
      { name: '샌드백 타격', rounds: 6, duration: '3분', restSec: 90, tip: '파워와 정확도 둘 다' },
      { name: '미트치기 (파트너)', rounds: 4, duration: '2분', restSec: 60, tip: '코치 피드백 반영' },
      { name: '코어 서킷', sets: 3, reps: '각 20회', restSec: 45 },
      { name: '버피', sets: 3, reps: 15, restSec: 45, tip: '폭발적으로' },
    ],
  };
}

function createFatLossWorkout(): WorkoutPlan {
  return {
    day: '월/수/금',
    category: '고강도 인터벌 + 근력',
    exercises: [
      { name: '줄넘기 인터벌', sets: 5, duration: '3분 on / 1분 rest', tip: '심박수 올리기' },
      { name: '버피', sets: 4, reps: 20, restSec: 45, tip: '전신 운동' },
      { name: '마운틴클라이머', sets: 3, reps: 30, restSec: 30 },
      { name: '케틀벨 스윙', sets: 4, reps: 15, restSec: 60, tip: '힙 힌지 동작' },
      { name: '점프 스쿼트', sets: 3, reps: 15, restSec: 45 },
    ],
  };
}

function createEnduranceWorkout(): WorkoutPlan {
  return {
    day: '화/목/일',
    category: '지구력 + 심폐',
    exercises: [
      { name: '러닝 (유산소)', duration: '30-45분', pace: '대화 가능한 속도', tip: '심박수 120-140' },
      { name: '사이클', duration: '20분', tip: '인터벌: 2분 빠르게 / 1분 천천히' },
      { name: '로잉머신', duration: '15분', tip: '전신 지구력' },
      { name: '바디웨이트 서킷', sets: 4, reps: '각 20회', restSec: 30 },
    ],
  };
}

// 목표별 루틴 생성
function generateWorkoutsByGoal(goal: string, hasGymAccess: boolean, experienceLevel: string, daysPerWeek: number, targetBodyParts?: string[]): WorkoutPlan[] {
  const workouts: WorkoutPlan[] = [];

  if (goal === 'muscleGain' && hasGymAccess) {
    const parts = targetBodyParts || ['chest', 'back', 'legs'];
    if (parts.includes('chest')) workouts.push(createChestWorkout(experienceLevel));
    if (parts.includes('back')) workouts.push(createBackWorkout(experienceLevel));
    if (parts.includes('legs') && daysPerWeek >= 3) workouts.push(createLegsWorkout());
  } else if (goal === 'boxingSkill') {
    workouts.push(createBoxingWorkout());
  } else if (goal === 'fatLoss') {
    workouts.push(createFatLossWorkout());
  } else if (goal === 'endurance') {
    workouts.push(createEnduranceWorkout());
  }

  return workouts;
}

// 주의사항 생성
function generateCautions(level: string): string[] {
  return [
    '⚠️ 관절 부상 주의: 무릎, 허리, 어깨는 천천히 워밍업 필수',
    '💧 수분 섭취: 운동 전후 충분한 물 섭취',
    '😴 휴식: 같은 부위는 최소 48시간 간격',
    `🎯 현재 레벨: ${LEVEL_NAMES[level] ?? ''} - 무게는 천천히 증가`,
  ];
}

// 메인 모듈
const workoutPlanModule: RegisterableModule = {
  type: 'tool',
  name: 'generate_workout_plan',
  description: '헬스/복싱 운동 루틴을 목표와 환경에 맞춰 생성합니다. 부위별 베스트 운동과 세트/휴식 시간까지 상세 제공.',
  register(server: McpServer): void {
    server.tool(
      'generate_workout_plan',
      '헬스/복싱 운동 루틴을 목표와 환경에 맞춰 생성합니다',
      {
        goal: z
          .enum(['fatLoss', 'muscleGain', 'boxingSkill', 'endurance'])
          .describe('운동 목표: fatLoss(체지방 감소), muscleGain(근비대), boxingSkill(복싱 기술), endurance(지구력)'),
        daysPerWeek: z.number().min(2).max(6).describe('주당 운동 일수 (2~6일)'),
        experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).describe('숙련도: beginner(초급), intermediate(중급), advanced(상급)'),
        hasGymAccess: z.boolean().describe('헬스장 이용 가능 여부'),
        targetBodyParts: z
          .array(z.enum(['chest', 'back', 'legs', 'shoulders', 'arms', 'core']))
          .optional()
          .describe('집중 부위 (선택)'),
      },
      (args): { content: Array<{ type: 'text'; text: string }> } => {
        const { goal, daysPerWeek, experienceLevel, hasGymAccess, targetBodyParts } = args;

        const workouts = generateWorkoutsByGoal(goal, hasGymAccess, experienceLevel, daysPerWeek, targetBodyParts);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  목표: GOAL_NAMES[goal],
                  레벨: LEVEL_NAMES[experienceLevel],
                  주간_운동_횟수: `${daysPerWeek.toString()}회`,
                  헬스장_이용: hasGymAccess ? '가능' : '홈트레이닝',
                  운동_루틴: workouts,
                  주의사항: generateCautions(experienceLevel),
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
