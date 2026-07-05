import axios from "axios";

/** Client call matched by xrepo to backend GET /api/login. */
export async function fetchLoginStatus(): Promise<unknown> {
  const response = await axios.get("/api/login");
  return response.data;
}
