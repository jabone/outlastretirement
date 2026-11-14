// The icons a Premium module may use from the host (PREMIUM_MODULE_CONTRACT.md
// 2.8). The host publishes these, not the whole lucide-react library: the
// whole library is about 150 KB gzipped, and publishing it put every icon
// in the startup download. A module that needs an icon not listed here asks
// for it to be added here first (a minor contract bump), or bundles it itself.
// The Premium repo checks its modules' imports against its copy of this list.
export {
  AlertCircle, AlertTriangle, Archive, ArrowRight, Award, BookOpen, Check, CheckCircle2,
  ChevronDown, CircleDashed, ClipboardCheck, Clock, Copy, DollarSign, Download, ExternalLink,
  FileText, History, Landmark, Layers, Link2, Loader2, Milestone, Pencil, Percent, PieChart,
  Plus, Printer, RefreshCw, Rocket, Scale, Settings, Target, Trash2, TrendingUp, Upload, X, XCircle,
} from 'lucide-react';
