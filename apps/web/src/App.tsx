import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { ScanProvider } from './features/scanner/ScanContext';
import { HomePage } from './pages/HomePage';
import { LookupPage } from './pages/LookupPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReportPage } from './pages/ReportPage';
import { ScanPage } from './pages/ScanPage';

export function App() {
  return (
    <ScanProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="scan" element={<ScanPage />} />
          <Route path="report" element={<ReportPage />} />
          <Route path="lookup" element={<LookupPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ScanProvider>
  );
}
