import { serve } from '@hono/node-server';
import { app } from './server';

serve(app).listen(3000).once('listening', () => {
	console.log('🚀 Server started on port 3000');
});
