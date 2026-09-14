export interface PricingPlanValues { name: string; totalLessons: number; validDays: number; price: number }
export interface PricingPlan extends Omit<PricingPlanValues, 'price'> { id: string; price: string | number; createdAt: string; updatedAt: string }
