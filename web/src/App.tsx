import { Navigate, Route, Routes } from "react-router";
import Dashboard from "./components/dashboard/Dashboard.tsx";
import Login from "./components/login/Login.tsx";
import { useSession } from "./components/session/SessionHooks.ts";
import SignUp from "./components/signup/SignUp.tsx";
import VerifyEmail from "./components/verify/VerifyEmail.tsx";

// Signed-out visitors can only reach the login, sign-up and verify screens,
// and signed-in users can't reach them. Clearing the session switches the routes, so any page a
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
      <Route path="/signup" element={<SignUp />} />
      <Route path="/verify" element={<VerifyEmail />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
