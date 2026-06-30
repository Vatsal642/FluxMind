import { httpServer } from './app';

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
