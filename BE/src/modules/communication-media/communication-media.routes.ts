import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { communicationMediaController } from './communication-media.controller';
import {
  createCommunicationMediaSchema,
  updateCommunicationMediaSchema,
  listCommunicationMediaQuerySchema,
  idParamSchema,
} from './communication-media.validation';

import { WRITE_ROLES } from '../../auth/roles';

/**
 * Communication Media routes.
 * RBAC (TDD_API §2): read = all authenticated;
 * write = SUPERADMIN, ADMIN, ADMIN_RTUPP.
 */
const router = Router();

router.use(authenticate);

router.get('/', validate(listCommunicationMediaQuerySchema, 'query'), communicationMediaController.list);
router.get('/:id', validate(idParamSchema, 'params'), communicationMediaController.getById);

router.post('/', authorize(...WRITE_ROLES), validate(createCommunicationMediaSchema), communicationMediaController.create);
router.put(
  '/:id',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateCommunicationMediaSchema),
  communicationMediaController.update
);
router.delete('/:id', authorize(...WRITE_ROLES), validate(idParamSchema, 'params'), communicationMediaController.remove);

export default router;
