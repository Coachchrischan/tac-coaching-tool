import { Navigate, Route, Routes } from 'react-router-dom';
import TabNav from './components/TabNav';
import ScheduleTab from './tabs/schedule/ScheduleTab';
import ProgrammingTab from './tabs/programming/ProgrammingTab';
import MovementCheckTab from './tabs/movement/MovementCheckTab';
import CommunityTab from './tabs/community/CommunityTab';
import PlanningTab from './tabs/planning/PlanningTab';
import LayoutsTab from './tabs/layouts/LayoutsTab';
import EquipmentTab from './tabs/equipment/EquipmentTab';
import TvPage from './tabs/tv/TvPage';

export default function App() {
  return (
    <Routes>
      <Route path="/tv/:sessionId" element={<TvPage />} />
      <Route
        path="*"
        element={
          <div className="min-h-screen">
            <TabNav />
            <main className="mx-auto max-w-[1440px] px-6 py-6">
              <Routes>
                <Route path="/" element={<Navigate to="/schedule" replace />} />
                <Route path="/schedule" element={<ScheduleTab />} />
                <Route path="/programming" element={<ProgrammingTab />} />
                <Route path="/movement" element={<MovementCheckTab />} />
                <Route path="/community" element={<CommunityTab />} />
                <Route path="/planning" element={<PlanningTab />} />
                <Route path="/layouts" element={<LayoutsTab />} />
                <Route path="/equipment" element={<EquipmentTab />} />
                <Route path="*" element={<Navigate to="/schedule" replace />} />
              </Routes>
            </main>
          </div>
        }
      />
    </Routes>
  );
}
