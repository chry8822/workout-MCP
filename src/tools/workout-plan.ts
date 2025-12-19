import { z } from 'zod';
import type { RegisterableModule } from '../registry/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const workoutPlanModule: RegisterableModule = {
  type: 'tool',
  name: 'generate_workout_plan',
  description: '헬스/복싱 운동 루틴을 목표와 환경에 맞춰 생성합니다',
  register(server: McpServer): void {
    server.tool(
      'generate_workout_plan',
      '헬스/복싱 운동 루틴을 목표와 환경에 맞춰 생성합니다',
      {
        goal: z.enum(['fatLoss', 'muscleGain', 'boxingSkill']).describe('운동 목표'),
        daysPerWeek: z.number().min(1).max(7).describe('주당 운동 일수'),
        experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).describe('숙련도'),
        hasGymAccess: z.boolean().describe('헬스장 이용 가능 여부'),
      },
      (args): { content: Array<{ type: 'text'; text: string }> } => {
        const { goal, daysPerWeek, experienceLevel, hasGymAccess } = args;
        const workouts = [];

        if (goal === 'muscleGain' && hasGymAccess) {
          workouts.push({
            day: '월요일',
            focus: '가슴/삼두',
            exercises: [
              { name: '벤치프레스', sets: 4, reps: 8, restSec: 90 },
              { name: '인클라인 덤벨프레스', sets: 3, reps: 10, restSec: 60 },
              { name: '딥스', sets: 3, reps: 12, restSec: 60 },
            ],
          });
          workouts.push({
            day: '수요일',
            focus: '등/이두',
            exercises: [
              { name: '데드리프트', sets: 4, reps: 6, restSec: 120 },
              { name: '풀업', sets: 3, reps: 8, restSec: 90 },
              { name: '바벨로우', sets: 3, reps: 10, restSec: 60 },
            ],
          });
          if (daysPerWeek >= 4) {
            workouts.push({
              day: '금요일',
              focus: '하체',
              exercises: [
                { name: '스쿼트', sets: 4, reps: 8, restSec: 120 },
                { name: '레그프레스', sets: 3, reps: 12, restSec: 90 },
              ],
            });
          }
        } else if (goal === 'boxingSkill') {
          workouts.push({
            day: '화목',
            focus: '복싱 기술 + 컨디셔닝',
            exercises: [
              { name: '섀도복싱', rounds: 5, minutesPerRound: 3, restSec: 60 },
              { name: '샌드백', rounds: 6, minutesPerRound: 3, restSec: 60 },
              { name: '버피', sets: 3, reps: 15, restSec: 45 },
            ],
          });
        } else if (goal === 'fatLoss') {
          workouts.push({
            day: '월수금',
            focus: '체지방 감소',
            exercises: [
              { name: '줄넘기', sets: 5, durationMin: 3, restSec: 60 },
              { name: '버피', sets: 4, reps: 20, restSec: 45 },
              { name: '마운틴클라이머', sets: 3, reps: 30, restSec: 30 },
            ],
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  plan: workouts,
                  notes: `${experienceLevel} 레벨, 주 ${daysPerWeek.toString()}회 기준 ${goal} 목표 루틴입니다. 관절 부상 주의하세요.`,
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
