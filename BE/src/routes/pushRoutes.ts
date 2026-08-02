import { Router } from 'express';
import * as controller from '../controllers/pushController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.post('/register', controller.register);
router.post('/unregister', controller.unregister);

export default router;
