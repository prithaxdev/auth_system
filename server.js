import app from "#src/app";
import { connectDB } from "#config/database";

const port = 3000;

connectDB();

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
