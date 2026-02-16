import { createClient } from "@base44/sdk";

const base44 = createClient({
  appId: "699358d9111157251d63d61f",
  options: {
    onError: (error) => {
      console.error("Base44 error:", error);
    },
  },
});

export default base44;
