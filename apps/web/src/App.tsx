import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { ScanProvider } from './features/scanner/ScanContext';
import { HomePage } from './pages/HomePage';
import { InspectPage } from './pages/InspectPage';
import { InspectReportPage } from './pages/InspectReportPage';
import { LookupPage } from './pages/LookupPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { DemoPage } from './pages/public/DemoPage';
import { HelpPage } from './pages/public/HelpPage';
import { ProductPage } from './pages/public/ProductPage';
import { ReportConcernPage } from './pages/public/ReportConcernPage';
import { ScanPage } from './pages/public/ScanPage';

export function App() {
  return (
    <ScanProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="scan" element={<ScanPage />} />
          <Route path="demo" element={<DemoPage />} />
          <Route path="product/:identifier" element={<ProductPage />} />
          <Route path="inspect" element={<InspectPage />} />
          <Route path="inspect/report" element={<InspectReportPage />} />
          <Route path="lookup" element={<LookupPage />} />
          <Route path="report" element={<ReportConcernPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ScanProvider>
  );
}
