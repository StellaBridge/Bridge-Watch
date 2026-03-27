import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import AssetDetail from "./pages/AssetDetail";
import Bridges from "./pages/Bridges";
import Analytics from "./pages/Analytics";
import ApiDocs from "./pages/ApiDocs";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/assets/:symbol" element={<AssetDetail />} />
        <Route path="/bridges" element={<Bridges />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/api-docs" element={<ApiDocs />} />
      </Route>
    </Routes>
  );
}

export default App;
