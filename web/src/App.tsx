import { Navigate, Route, Routes } from "react-router";
import Dashboard from "./components/dashboard/Dashboard.tsx";
import Login from "./components/login/Login.tsx";
import { useSession } from "./components/session/SessionHooks.ts";

// Signed-out visitors can only reach the login screen, and signed-in users
// can't reach it. Clearing the session switches the routes, so any page a
// signed-out visitor opens sends them to /login.
export default function App() {
  const { token } = useSession();
  return token ? <SignedInRoutes /> : <SignedOutRoutes />;
}

function SignedInRoutes() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function SignedOutRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
