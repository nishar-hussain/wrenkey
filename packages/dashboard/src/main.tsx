import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WranKeyProvider } from "@wrankey/sdk/react";
import Layout from "./components/Layout";
import DashboardPage from "./pages/Dashboard";
import LoginPage from "./pages/Login";
import WalletsPage from "./pages/Wallets";
import WalletDetailPage from "./pages/WalletDetail";
import TransactionsPage from "./pages/Transactions";
import PoliciesPage from "./pages/Policies";
import AgentsPage from "./pages/Agents";
import UsersPage from "./pages/Users";
import WebhooksPage from "./pages/Webhooks";
import AuditLogsPage from "./pages/AuditLogs";
import "./index.css";

const config = {
  apiBase: "http://localhost:3001",
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WranKeyProvider config={config}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/wallets" element={<WalletsPage />} />
            <Route path="/wallets/:id" element={<WalletDetailPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/policies" element={<PoliciesPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/webhooks" element={<WebhooksPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WranKeyProvider>
  </React.StrictMode>
);
