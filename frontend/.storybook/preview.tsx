import type { Preview } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import "../src/index.css";

export const globalTypes = {
  theme: {
    name: "Theme",
    description: "Global theme for components",
    defaultValue: "dark",
    toolbar: {
      icon: "circlehollow",
      items: [
        { value: "light", title: "Light Theme", icon: "sun" },
        { value: "dark", title: "Dark Theme", icon: "moon" },
      ],
      showName: true,
      dynamicTitle: true,
    },
  },
};

const preview: Preview = {
  parameters: {
    layout: "padded",
    controls: { expanded: true },
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#0B0E14" },
        { name: "light", value: "#F8FAFC" },
      ],
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme || "dark";
      const isDark = theme === "dark";

      return (
        <MemoryRouter>
          <div
            data-theme={theme}
            className={`${isDark ? "dark bg-stellar-dark text-stellar-text-primary" : "light bg-slate-50 text-slate-900"} min-h-[200px] rounded-lg p-4 transition-colors`}
          >
            <Story />
          </div>
        </MemoryRouter>
      );
    },
  ],
};

export default preview;
