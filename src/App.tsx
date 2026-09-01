import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import TabNav from './components/TabNav';
import ErrorBoundary from './components/ErrorBoundary';
import SystemBanners from './components/SystemBanners';
import ScheduleTab from './tabs/schedule/ScheduleTab';
import AnnualPlanTab from './tabs/annual/AnnualPlanTab';
import HomeTab from './tabs/home/HomeTab';
import AttendanceTab from './tabs/attendance/AttendanceTab';
import EthosTab from './tabs/ethos/EthosTab';
import ProgrammingTab from './tabs/programming/ProgrammingTab';
import MovementCheckTab from './tabs/movement/MovementCheckTab';
import CommunityTab from './tabs/community/CommunityTab';
import PlanningTab from './tabs/planning/PlanningTab';
import LayoutsTab from './tabs/layouts/LayoutsTab';
import EquipmentTab from './tabs/equipment/EquipmentTab';
import TvPage from './tabs/tv/TvPage';
import OverviewPage from './tabs/overview/OverviewPage';

export default function App() {
  // The boundary is keyed by route so a crash in one tab never blanks the
  // tool, and navigating away and back gives the tab a clean remount.
  const { pathname } = useLocation();
  return (
    <Routes>
      <Route
        path="/tv/:sessionId"
        element={
          <ErrorBoundary key={pathname}>
            <TvPage />
          </ErrorBoundary>
        }
      />
      <Route
        path="/overview"
        element={
          <ErrorBoundary key={pathname}>
            <OverviewPage />
          </ErrorBoundary>
        }
      />
      <Route
        path="*"
        element={
          <div className="min-h-screen">
            <TabNav />
            <SystemBanners />
            <main className="mx-auto max-w-[1440px] px-6 py-6">
              <ErrorBoundary key={pathname}>
                <Routes>
                  <Route path="/" element={<HomeTab />} />
                  <Route path="/attendance" element={<AttendanceTab />} />
                  <Route path="/ethos" element={<EthosTab />} />
                  <Route path="/schedule" element={<ScheduleTab />} />
                  <Route path="/programming" element={<ProgrammingTab />} />
                  <Route path="/annual" element={<AnnualPlanTab />} />
                  <Route path="/movement" element={<MovementCheckTab />} />
                  <Route path="/community" element={<CommunityTab />} />
                  <Route path="/planning" element={<PlanningTab />} />
                  <Route path="/layouts" element={<LayoutsTab />} />
                  <Route path="/equipment" element={<EquipmentTab />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </ErrorBoundary>
            </main>
          </div>
        }
      />
    </Routes>
  );
}
