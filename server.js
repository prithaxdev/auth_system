import app from "#src/app";
import { connectDB } from "#config/database";
import config from "#config/config";

connectDB();

app.listen(config.PORT, () => {
  console.log(`Server is running on port ${config.PORT}`);
});
