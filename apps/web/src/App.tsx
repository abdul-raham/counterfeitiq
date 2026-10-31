import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { LoginPage, ProtectedPortal } from './components/PortalLayout';
import * as admin from './features/admin/pages';
import * as manufacturer from './features/manufacturer/pages';
import { ScanProvider } from './features/scanner/ScanContext';
import { VerifyProvider } from './features/verify/VerifyContext';
import { HomePage } from './pages/HomePage';
import { InspectPage } from './pages/InspectPage';
import { InspectReportPage } from './pages/InspectReportPage';
import { LookupPage } from './pages/LookupPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AuthenticatePage } from './pages/public/AuthenticatePage';
import { HelpPage } from './pages/public/HelpPage';
import { ProductPage } from './pages/public/ProductPage';
import { ReportConcernPage } from './pages/public/ReportConcernPage';
import { ScanPage } from './pages/public/ScanPage';
import { VerificationResultPage } from './pages/public/VerificationResultPage';

const MANUFACTURER_NAV = [
  { to: '/manufacturer/dashboard', label: 'Dashboard' },
  { to: '/manufacturer/products', label: 'Products' },
  { to: '/manufacturer/batches', label: 'Batches' },
  { to: '/manufacturer/code-allocations', label: 'Code allocations' },
  { to: '/manufacturer/verification-activity', label: 'Activity' },
  { to: '/manufacturer/settings', label: 'Settings' },
];

const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/applications', label: 'Applications' },
  { to: '/admin/manufacturers', label: 'Manufacturers' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/batches', label: 'Batches' },
  { to: '/admin/code-allocations', label: 'Code allocations' },
  { to: '/admin/verification-events', label: 'Events' },
  { to: '/admin/investigations', label: 'Investigations' },
  { to: '/admin/audit', label: 'Audit log' },
];

export function App() {
  return (
    <ScanProvider>
      <VerifyProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="scan" element={<ScanPage />} />
            <Route path="product/:identifier" element={<ProductPage />} />
            <Route path="authenticate" element={<AuthenticatePage />} />
            <Route path="verification/result" element={<VerificationResultPage />} />
            <Route path="inspect" element={<InspectPage />} />
            <Route path="inspect/report" element={<InspectReportPage />} />
            <Route path="lookup" element={<LookupPage />} />
            <Route path="report" element={<ReportConcernPage />} />
            <Route path="help" element={<HelpPage />} />

            <Route path="manufacturer/apply" element={<manufacturer.ApplyPage />} />
            <Route path="manufacturer/login" element={<LoginPage audience="manufacturer" />} />
            <Route path="manufacturer/pending" element={<manufacturer.PendingPage />} />
            <Route path="manufacturer" element={<ProtectedPortal audience="manufacturer" nav={MANUFACTURER_NAV} />}>
              <Route path="dashboard" element={<manufacturer.DashboardPage />} />
              <Route path="products" element={<manufacturer.ProductsPage />} />
              <Route path="products/new" element={<manufacturer.NewProductPage />} />
              <Route path="products/:id" element={<manufacturer.ProductDetailPage />} />
              <Route path="batches" element={<manufacturer.BatchesPage />} />
              <Route path="batches/new" element={<manufacturer.NewBatchPage />} />
              <Route path="batches/:id" element={<manufacturer.BatchDetailPage />} />
              <Route path="code-allocations" element={<manufacturer.AllocationsPage />} />
              <Route path="verification-activity" element={<manufacturer.ActivityPage />} />
              <Route path="settings" element={<manufacturer.SettingsPage />} />
            </Route>

            <Route path="admin/login" element={<LoginPage audience="admin" />} />
            <Route path="admin" element={<ProtectedPortal audience="admin" nav={ADMIN_NAV} />}>
              <Route path="dashboard" element={<admin.AdminDashboardPage />} />
              <Route path="applications" element={<admin.ApplicationsPage />} />
              <Route path="manufacturers" element={<admin.AdminManufacturersPage />} />
              <Route path="products" element={<admin.AdminProductsPage />} />
              <Route path="batches" element={<admin.AdminBatchesPage />} />
              <Route path="code-allocations" element={<admin.AdminAllocationsPage />} />
              <Route path="verification-events" element={<admin.AdminEventsPage />} />
              <Route path="investigations" element={<admin.AdminInvestigationsPage />} />
              <Route path="audit" element={<admin.AdminAuditPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </VerifyProvider>
    </ScanProvider>
  );
}
