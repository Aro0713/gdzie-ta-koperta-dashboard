const config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gtk: {
          blue: "#0284c7",
          dark: "#0f172a",
          amber: "#d97706",
          green: "#16a34a",
          surface: "#f8fafc",
        }
      }
    },
  },
  plugins: [],
};
export default config;
