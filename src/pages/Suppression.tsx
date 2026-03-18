import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Suppression() {
  const navigate = useNavigate();
  useEffect(() => {
    // Redirect to the combined bounces page with suppression tab
    navigate("/bounces?tab=suppression", { replace: true });
  }, [navigate]);
  return null;
}
