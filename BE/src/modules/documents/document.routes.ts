import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { upload } from '../../middlewares/upload';
import { documentController } from './document.controller';
import { listDocumentQuerySchema, idParamSchema } from './document.validation';

import { WRITE_ROLES as CRUD_ROLES } from '../../auth/roles';

/**
 * Document routes.
 * RBAC (TDD_API §2): Documents — USER = Upload/View; CRUD roles = full.
 * → list/get/upload = any authenticated role; delete = CRUD roles only.
 */
const router = Router();
router.use(authenticate);

router.get('/', validate(listDocumentQuerySchema, 'query'), documentController.list);
router.get('/:id', validate(idParamSchema, 'params'), documentController.getById);

// Upload — multipart; body validated inside the controller (after multer parses).
router.post('/', upload.single('file'), documentController.create);

router.delete('/:id', authorize(...CRUD_ROLES), validate(idParamSchema, 'params'), documentController.remove);

export default router;
