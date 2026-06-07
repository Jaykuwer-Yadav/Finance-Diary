const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:5000/api"
  : "/api";

export const login = async (email, password) => {
  const response = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  if (data.token) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.role);
  }
  return data;
};

export const fetchFinancialData = async () => {
  const token = localStorage.getItem("token");
  const response = await fetch(`${API_URL}/financials`, {
    method: "GET",
    headers: { 
      "Authorization": `Bearer ${token}`
    }
  });
  return await response.json();
};
