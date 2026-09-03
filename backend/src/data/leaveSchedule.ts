export interface SchedulePeriod {
  name: string;
  type: 'APPROVED' | 'BLACKOUT';
  startMonth: number; // 1-12
  startDay: number;   // 1-31
  endMonth: number;
  endDay: number;
  notes: string;
}

// Annual repeating leave schedule. Block 1 wraps the year boundary (Nov-Jan).
export const SCHEDULE_PERIODS: SchedulePeriod[] = [
  {
    name: 'Block 1',
    type: 'APPROVED',
    startMonth: 11, startDay: 15,
    endMonth: 1,   endDay: 25,
    notes: 'Covers the Winter Holidays',
  },
  {
    name: "Valentine's Day Blackout",
    type: 'BLACKOUT',
    startMonth: 1, startDay: 26,
    endMonth: 2,   endDay: 14,
    notes: "Valentine's Day production and shipping",
  },
  {
    name: 'Block 2',
    type: 'APPROVED',
    startMonth: 2, startDay: 15,
    endMonth: 4,   endDay: 19,
    notes: "Starts immediately after the Valentine's Day rush",
  },
  {
    name: "Mother's Day Blackout",
    type: 'BLACKOUT',
    startMonth: 4, startDay: 20,
    endMonth: 5,   endDay: 10,
    notes: "Mother's Day preparation, production, and shipping",
  },
  {
    name: 'Block 3',
    type: 'APPROVED',
    startMonth: 5, startDay: 11,
    endMonth: 7,   endDay: 12,
    notes: 'Covers the late spring and early summer transitions',
  },
  {
    name: 'Block 4',
    type: 'APPROVED',
    startMonth: 7, startDay: 13,
    endMonth: 9,   endDay: 13,
    notes: 'Covers the peak summer months',
  },
  {
    name: 'Block 5',
    type: 'APPROVED',
    startMonth: 9,  startDay: 14,
    endMonth: 11, endDay: 16,
    notes: 'Covers Fall and Thanksgiving, bridging the gap until the Winter Holiday block begins',
  },
];

export interface SeasonalWindow {
  name: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  maxCompanyWide: number;
  note: string;
}

// Ordered from most restrictive to least, so the first match wins for peak periods.
export const SEASONAL_WINDOWS: SeasonalWindow[] = [
  {
    name: "Peak Valentine's Week",
    startMonth: 2, startDay: 7,
    endMonth: 2,   endDay: 14,
    maxCompanyWide: 1,
    note: "Valentine's Day peak — strict 1 employee company-wide",
  },
  {
    name: "Peak Mother's Day Period",
    startMonth: 4, startDay: 20,
    endMonth: 5,   endDay: 10,
    maxCompanyWide: 1,
    note: "Mother's Day peak — strict 1 employee company-wide",
  },
  {
    name: 'Spring',
    startMonth: 2, startDay: 15,
    endMonth: 4,   endDay: 19,
    maxCompanyWide: 2,
    note: 'Mid-February through Mid-May. Minor overlapping permitted if employees are in different departments.',
  },
  {
    name: 'Post-Mother\'s Day',
    startMonth: 5, startDay: 11,
    endMonth: 8,   endDay: 31,
    maxCompanyWide: 6,
    note: 'Mid-May through August',
  },
  {
    name: 'Autumn',
    startMonth: 9, startDay: 1,
    endMonth: 10,  endDay: 31,
    maxCompanyWide: 5,
    note: 'September through October',
  },
  {
    name: 'Winter',
    startMonth: 11, startDay: 1,
    endMonth: 1,    endDay: 31,
    maxCompanyWide: 10,
    note: 'November through January',
  },
];
