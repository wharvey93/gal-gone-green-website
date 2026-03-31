import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(join(__dirname, 'dist')));

// Fallback to index.html for any unmatched routes
app.use((req, res) => {
  res.status(404).sendFile(join(__dirname, 'dist', '404.html'), (err) => {
    if (err) res.status(404).send('Page not found');
  });
});

app.listen(PORT, () => {
  console.log(`Gal Gone Green serving on port ${PORT}`);
});
