import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { MONITOR_ROLES } from '../../auth/roles';
import { kpiController } from './kpi.controller';
import { kpiQuerySchema } from './kpi.validation';

/**
 * KPI Dashboard routes (Enterprise executive & operational KPIs).
 *
 * RBAC: read-only monitoring tier → MASTER + MANAGER + ADMIN (MONITOR_ROLES).
 * MASTER/MANAGER see GLOBAL figures; ADMIN is scoped to its own RTUPP by the
 * service. These are read-only endpoints, safe for the MANAGER monitoring role.
 * Field officers (PETUGAS) keep their own operational dashboard and are not
 * granted these aggregate, cross-team views.
 */
const router = Router();

router.use(authenticate, authorize(...MONITOR_ROLES));

router.get('/dashboard', validate(kpiQuerySchema, 'query'), kpiController.dashboard);
router.get('/summary', validate(kpiQuerySchema, 'query'), kpiController.summary);
router.get('/team-performance', kpiController.teamPerformance);
router.get('/monthly-trend', validate(kpiQuerySchema, 'query'), kpiController.monthlyTrend);

export default router;
