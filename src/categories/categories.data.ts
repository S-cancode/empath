export interface Category {
  id: string;
  name: string;
  description: string;
  subTags: SubTag[];
}

export interface SubTag {
  id: string;
  name: string;
  premiumOnly?: boolean;
}

export const categories: Category[] = [
  {
    id: "work-career",
    name: "Work & Career",
    description: "Career challenges, burnout, or work-life balance",
    subTags: [
      { id: "burnout", name: "Burnout" },
      { id: "job-loss", name: "Job loss / redundancy" },
      { id: "workplace-bullying", name: "Workplace bullying", premiumOnly: true },
      { id: "career-change", name: "Career change", premiumOnly: true },
      { id: "work-life-balance", name: "Work-life balance", premiumOnly: true },
    ],
  },
  {
    id: "relationships",
    name: "Relationships",
    description: "Struggles with partners, family, or friends",
    subTags: [
      { id: "breakup", name: "Breakup / divorce" },
      { id: "family-conflict", name: "Family conflict" },
      { id: "toxic-relationship", name: "Toxic relationship", premiumOnly: true },
      { id: "dating", name: "Dating difficulties", premiumOnly: true },
      { id: "long-distance", name: "Long-distance relationship", premiumOnly: true },
    ],
  },
  {
    id: "financial-stress",
    name: "Financial Stress",
    description: "Money worries, debt, or financial uncertainty",
    subTags: [
      { id: "debt", name: "Debt & bills" },
      { id: "cost-of-living", name: "Cost of living" },
      { id: "financial-planning", name: "Financial planning anxiety", premiumOnly: true },
      { id: "housing", name: "Housing insecurity", premiumOnly: true },
    ],
  },
  {
    id: "grief",
    name: "Grief & Loss",
    description: "Coping with loss of a loved one or major life change",
    subTags: [
      { id: "death-of-loved-one", name: "Death of a loved one" },
      { id: "pet-loss", name: "Pet loss" },
      { id: "miscarriage", name: "Miscarriage / pregnancy loss", premiumOnly: true },
      { id: "anticipatory-grief", name: "Anticipatory grief", premiumOnly: true },
    ],
  },
  {
    id: "academic-pressure",
    name: "Academic Pressure",
    description: "Exam stress, university struggles, or educational challenges",
    subTags: [
      { id: "exam-stress", name: "Exam stress" },
      { id: "university-struggles", name: "University struggles" },
      { id: "imposter-syndrome", name: "Academic imposter syndrome", premiumOnly: true },
      { id: "thesis-pressure", name: "Thesis / dissertation pressure", premiumOnly: true },
    ],
  },
  {
    id: "health",
    name: "Health & Chronic Illness",
    description: "Living with health conditions, chronic pain, or disability",
    subTags: [
      { id: "chronic-pain", name: "Chronic pain" },
      { id: "mental-health-diagnosis", name: "Mental health diagnosis" },
      { id: "chronic-illness", name: "Chronic illness management", premiumOnly: true },
      { id: "disability", name: "Disability & accessibility", premiumOnly: true },
      { id: "caregiver-fatigue", name: "Caregiver fatigue", premiumOnly: true },
    ],
  },
  {
    id: "parenting",
    name: "Parenting",
    description: "Parenting challenges, new parenthood, or family dynamics",
    subTags: [
      { id: "new-parent", name: "New parenthood" },
      { id: "single-parenting", name: "Single parenting" },
      { id: "postnatal", name: "Postnatal depression", premiumOnly: true },
      { id: "co-parenting", name: "Co-parenting challenges", premiumOnly: true },
    ],
  },
  {
    id: "identity",
    name: "Identity & Life Transitions",
    description: "Major life changes, identity struggles, or feeling lost",
    subTags: [
      { id: "feeling-lost", name: "Feeling lost" },
      { id: "life-transition", name: "Major life transition" },
      { id: "identity-crisis", name: "Identity crisis", premiumOnly: true },
      { id: "cultural-identity", name: "Cultural identity", premiumOnly: true },
      { id: "quarter-life-crisis", name: "Quarter-life / mid-life crisis", premiumOnly: true },
    ],
  },
];
