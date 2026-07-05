import { configure } from "@testing-library/react";
import "../i18n";

/** Allow debounced UI and router transitions to settle under parallel jsdom workers. */
configure({ asyncUtilTimeout: 5000 });
