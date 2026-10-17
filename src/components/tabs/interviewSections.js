import {
  Users, DollarSign, Wallet, PiggyBank, Home, HeartPulse, TrendingDown,
  Landmark, Gift, Sparkles, CheckCircle, Briefcase, ClipboardCheck, ShieldCheck,
} from 'lucide-react';

// The Full Guided Interview's steps, in order (InterviewTab.jsx).
export const SECTIONS = [
  { id: 'household', label: 'Household', icon: Users },
  { id: 'income', label: 'Income & SS', icon: DollarSign },
  { id: 'pensions', label: 'Pensions & Other Income', icon: Briefcase },
  { id: 'balances', label: 'Account Balances', icon: Wallet },
  { id: 'savings', label: 'Savings & Match', icon: PiggyBank },
  { id: 'spending', label: 'Spending', icon: Home },
  { id: 'healthcare', label: 'Healthcare & LTC', icon: HeartPulse },
  { id: 'withdrawal', label: 'Withdrawal Strategy', icon: TrendingDown },
  { id: 'roth', label: 'Roth & Medicare', icon: Sparkles },
  { id: 'equity', label: 'Employer Equity', icon: Briefcase },
  { id: 'milestones', label: 'Life Events', icon: Gift },
  { id: 'debt', label: 'Debt, Home & Insurance', icon: Landmark },
  { id: 'estate', label: 'Estate & Heirs', icon: ShieldCheck },
  { id: 'risk', label: 'Taxes & Assumptions', icon: ClipboardCheck },
  { id: 'review', label: 'Review', icon: CheckCircle },
];
