import app from "./src/app.js";
import { connectDB } from "./src/config/database.js";

const port = 3000;

connectDB();

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
