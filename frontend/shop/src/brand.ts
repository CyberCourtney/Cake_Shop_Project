// The shop's name and the baker's name are not in the code. scripts/publish-frontend.sh
// sets them at build time from the deployment parameters (BusinessDisplayName, BakerName).
// The fallbacks are only for local development.
export const BUSINESS_NAME: string = import.meta.env.VITE_BUSINESS_NAME || "Example Cake Co";
export const BAKER_NAME: string = import.meta.env.VITE_BAKER_NAME || "Sam";
