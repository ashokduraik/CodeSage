import { useTranslation } from "react-i18next";
import { useHealth } from "./useHealth";

/**
 * Root application component.
 * Displays the API health status using React Query for data fetching
 * and i18n for all user-facing strings.
 * @returns The root application UI.
 */
export function App() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useHealth();

  return (
    <main>
      <h1>{t("app.title")}</h1>
      <p data-testid="status">
        {isPending && t("status.checking")}
        {data && t("status.healthy", { service: data.service })}
        {isError && t("status.unreachable")}
      </p>
    </main>
  );
}
