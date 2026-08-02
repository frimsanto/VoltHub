/**
 * OpenAPI 3.0 specification for the VoltHub V2 Asset Management API.
 *
 * Hand-maintained (no swagger-jsdoc) so the contract stays explicit and matches
 * TDD_API_VoltReport_V2.md. Served via swagger-ui-express at `${API_PREFIX}/docs`.
 * Sprint 1 scope: Locations, Feeders, Assets, Asset SIM Cards, Communication Media.
 */

const bearerAuth = [{ bearerAuth: [] }];

const pagedMeta = {
  type: 'object',
  properties: {
    page: { type: 'integer', example: 1 },
    limit: { type: 'integer', example: 20 },
    total: { type: 'integer', example: 42 },
    totalPages: { type: 'integer', example: 3 },
  },
};

const apiResponse = (dataSchema: object) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string', example: 'Success' },
    data: dataSchema,
    meta: pagedMeta,
  },
});

const listQueryParams = (extra: object[] = []) => [
  { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
  { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
  { in: 'query', name: 'search', schema: { type: 'string' } },
  ...extra,
];

const idParam = {
  in: 'path',
  name: 'id',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

// Standard responses reused across endpoints.
const stdErrors = {
  401: { description: 'Unauthorized' },
  403: { description: 'Forbidden — insufficient role' },
  404: { description: 'Not Found' },
  409: { description: 'Conflict — duplicate data' },
  422: { description: 'Validation / business rule error' },
};

function crudPaths(opts: {
  base: string;
  tag: string;
  name: string;
  createRef: string;
  updateRef: string;
  entityRef: string;
  writeRoles: string;
  listParams?: object[];
}) {
  const { base, tag, name, createRef, updateRef, entityRef, writeRoles, listParams } = opts;
  return {
    [base]: {
      get: {
        tags: [tag],
        summary: `List ${name}`,
        security: bearerAuth,
        parameters: listQueryParams(listParams),
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: apiResponse({ type: 'array', items: { $ref: entityRef } }),
              },
            },
          },
          ...stdErrors,
        },
      },
      post: {
        tags: [tag],
        summary: `Create ${name} (roles: ${writeRoles})`,
        security: bearerAuth,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: createRef } } },
        },
        responses: { 201: { description: 'Created' }, ...stdErrors },
      },
    },
    [`${base}/{id}`]: {
      get: {
        tags: [tag],
        summary: `Get ${name} by id`,
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
      put: {
        tags: [tag],
        summary: `Update ${name} (roles: ${writeRoles})`,
        security: bearerAuth,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: updateRef } } },
        },
        responses: { 200: { description: 'Updated' }, ...stdErrors },
      },
      delete: {
        tags: [tag],
        summary: `Soft delete ${name} (roles: ${writeRoles})`,
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'Deleted' }, ...stdErrors },
      },
    },
  };
}

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'VoltHub V2 — Asset Management API',
    version: '2.0.0',
    description:
      'Sprint 1: Locations, Feeders, Assets, Asset SIM Cards, Communication Media. ' +
      'All responses follow the ApiResponse envelope `{ success, message, data, meta }`.',
  },
  servers: [{ url: '/api/v1', description: 'V2 base path' }],
  tags: [
    { name: 'Organizations' },
    { name: 'UP3' },
    { name: 'Asset Categories' },
    { name: 'Asset Types' },
    { name: 'Locations' },
    { name: 'Feeders' },
    { name: 'Assets' },
    { name: 'Asset SIM Cards' },
    { name: 'Communication Media' },
    { name: 'Inspections' },
    { name: 'HAR' },
    { name: 'Performance' },
    { name: 'Tickets' },
    { name: 'Documents' },
    { name: 'Reports' },
    { name: 'Digital Signature', description: 'Ed25519 digital signatures on every generated report (Laporan Awal/Akhir, Inspection, HAR). Each report embeds an offline-verifiable QR token. Public verification needs no auth. Spec: docs/DIGITAL_SIGNATURE.md.' },
    { name: 'Imports' },
    { name: 'Audit Logs' },
    { name: 'KPI', description: 'Executive & operational KPI dashboard (aggregates field reports across laporan_awal + laporan_akhir). Roles: SUPER_ADMIN (global), ADMIN (own RTUPP).' },
    { name: 'Dashboard', description: 'Single aggregate management-overview endpoint — every operational counter/breakdown/trend in one optimized round-trip, replacing the per-card request fan-out.' },
    { name: 'Notifications', description: 'Real-time notification center — the caller’s own inbox. In-app rows are created synchronously on trigger events; push delivery is drained by an in-process retry queue. Spec: docs/NOTIFICATION_SYSTEM.md.' },
    { name: 'AI' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Location: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          code: { type: 'string' },
          name: { type: 'string' },
          locationType: { type: 'string', enum: ['GI', 'GH', 'GARDU'] },
          up3: { type: 'string', nullable: true },
          address: { type: 'string', nullable: true },
          latitude: { type: 'number', nullable: true },
          longitude: { type: 'number', nullable: true },
          status: { type: 'boolean' },
        },
      },
      CreateLocation: {
        type: 'object',
        required: ['code', 'name', 'locationType'],
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          locationType: { type: 'string', enum: ['GI', 'GH', 'GARDU'] },
          up3: { type: 'string', nullable: true },
          address: { type: 'string', nullable: true },
          latitude: { type: 'number', nullable: true },
          longitude: { type: 'number', nullable: true },
          status: { type: 'boolean', default: true },
        },
      },
      UpdateLocation: { allOf: [{ $ref: '#/components/schemas/CreateLocation' }] },
      Feeder: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          locationId: { type: 'string', format: 'uuid' },
          feederCode: { type: 'string' },
          feederName: { type: 'string' },
        },
      },
      CreateFeeder: {
        type: 'object',
        required: ['locationId', 'feederCode', 'feederName'],
        properties: {
          locationId: { type: 'string', format: 'uuid' },
          feederCode: { type: 'string' },
          feederName: { type: 'string' },
        },
      },
      UpdateFeeder: { allOf: [{ $ref: '#/components/schemas/CreateFeeder' }] },
      Asset: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          locationId: { type: 'string', format: 'uuid' },
          feederId: { type: 'string', format: 'uuid', nullable: true },
          parentAssetId: { type: 'string', format: 'uuid', nullable: true },
          assetType: {
            type: 'string',
            enum: ['RTU', 'FDI', 'RECTIFIER', 'BATTERY_BANK', 'ROUTER', 'MODEM', 'RADIO'],
          },
          assetCode: { type: 'string' },
          assetName: { type: 'string' },
          status: { type: 'string', enum: ['ACTIVE', 'WARNING', 'DAMAGED', 'RETIRED'] },
        },
      },
      CreateAsset: {
        type: 'object',
        required: ['locationId', 'assetType', 'assetCode', 'assetName'],
        properties: {
          locationId: { type: 'string', format: 'uuid' },
          feederId: { type: 'string', format: 'uuid', nullable: true },
          parentAssetId: { type: 'string', format: 'uuid', nullable: true },
          assetType: {
            type: 'string',
            enum: ['RTU', 'FDI', 'RECTIFIER', 'BATTERY_BANK', 'ROUTER', 'MODEM', 'RADIO'],
          },
          assetCode: { type: 'string' },
          assetName: { type: 'string' },
          brand: { type: 'string', nullable: true },
          model: { type: 'string', nullable: true },
          serialNumber: { type: 'string', nullable: true },
          tahunOperasi: { type: 'integer', nullable: true },
          status: { type: 'string', enum: ['ACTIVE', 'WARNING', 'DAMAGED', 'RETIRED'] },
          notes: { type: 'string', nullable: true },
          protocol: { type: 'string', nullable: true },
          asdu: { type: 'string', nullable: true },
          linkAddress: { type: 'string', nullable: true },
          pairChannel: { type: 'string', nullable: true },
          masterIp1: { type: 'string', nullable: true },
          masterIp2: { type: 'string', nullable: true },
          batteryCount: { type: 'integer', nullable: true },
          capacity: { type: 'string', nullable: true },
        },
      },
      UpdateAsset: { allOf: [{ $ref: '#/components/schemas/CreateAsset' }] },
      SimCard: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          assetId: { type: 'string', format: 'uuid' },
          simSlot: { type: 'integer' },
          provider: { type: 'string', nullable: true },
          phoneNumber: { type: 'string', nullable: true },
          iccid: { type: 'string', nullable: true },
          ipAddress: { type: 'string', nullable: true },
        },
      },
      CreateSimCard: {
        type: 'object',
        required: ['simSlot'],
        properties: {
          simSlot: { type: 'integer', minimum: 1 },
          provider: { type: 'string', nullable: true },
          phoneNumber: { type: 'string', nullable: true },
          iccid: { type: 'string', nullable: true },
          ipAddress: { type: 'string', nullable: true },
        },
      },
      UpdateSimCard: { allOf: [{ $ref: '#/components/schemas/CreateSimCard' }] },
      CommunicationMedia: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          locationId: { type: 'string', format: 'uuid' },
          mediaType: {
            type: 'string',
            enum: ['GSM_4G', 'GSM_2G', 'RADIO_DATA', 'FO', 'ICON_GSM', 'ICON_IPVPN'],
          },
          provider: { type: 'string', nullable: true },
          status: { type: 'boolean' },
          notes: { type: 'string', nullable: true },
        },
      },
      CreateCommunicationMedia: {
        type: 'object',
        required: ['locationId', 'mediaType'],
        properties: {
          locationId: { type: 'string', format: 'uuid' },
          mediaType: {
            type: 'string',
            enum: ['GSM_4G', 'GSM_2G', 'RADIO_DATA', 'FO', 'ICON_GSM', 'ICON_IPVPN'],
          },
          provider: { type: 'string', nullable: true },
          status: { type: 'boolean', default: true },
          notes: { type: 'string', nullable: true },
        },
      },
      UpdateCommunicationMedia: {
        allOf: [{ $ref: '#/components/schemas/CreateCommunicationMedia' }],
      },
      CreateInspection: {
        type: 'object',
        required: ['locationId', 'inspectionDate'],
        properties: {
          locationId: { type: 'string', format: 'uuid' },
          inspectionDate: { type: 'string', format: 'date', example: '2026-06-01' },
          notes: { type: 'string', nullable: true },
        },
      },
      CreateFinding: {
        type: 'object',
        required: ['assetId', 'status'],
        properties: {
          assetId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['NORMAL', 'WARNING', 'CRITICAL'] },
          finding: { type: 'string', nullable: true },
          recommendation: { type: 'string', nullable: true },
        },
      },
      CreateHarReport: {
        type: 'object',
        required: ['locationId', 'reportDate'],
        properties: {
          locationId: { type: 'string', format: 'uuid' },
          reportDate: { type: 'string', format: 'date', example: '2026-06-01' },
        },
      },
      CreateHarDetail: {
        type: 'object',
        required: ['assetId', 'status'],
        properties: {
          assetId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['NORMAL', 'WARNING', 'CRITICAL', 'OFFLINE'] },
          analysis: { type: 'string', nullable: true },
          notes: { type: 'string', nullable: true },
        },
      },
      UpdateHarDetail: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['NORMAL', 'WARNING', 'CRITICAL', 'OFFLINE'] },
          analysis: { type: 'string', nullable: true },
          notes: { type: 'string', nullable: true },
        },
      },
      GenerateInspectionReport: {
        type: 'object',
        required: ['inspectionId'],
        properties: { inspectionId: { type: 'string', format: 'uuid' } },
      },
      GenerateHarReport: {
        type: 'object',
        required: ['harReportId'],
        properties: { harReportId: { type: 'string', format: 'uuid' } },
      },
      // ── Gardu-centric foundation & master data (Phase 2) ──
      Organization: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          code: { type: 'string' },
          name: { type: 'string' },
        },
      },
      CreateOrganization: {
        type: 'object',
        required: ['code', 'name'],
        properties: { code: { type: 'string' }, name: { type: 'string' } },
      },
      UpdateOrganization: { allOf: [{ $ref: '#/components/schemas/CreateOrganization' }] },
      Up3: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          rtuppId: { type: 'string', format: 'uuid' },
          code: { type: 'string' },
          name: { type: 'string' },
        },
      },
      CreateUp3: {
        type: 'object',
        required: ['rtuppId', 'code', 'name'],
        properties: {
          rtuppId: { type: 'string', format: 'uuid' },
          code: { type: 'string' },
          name: { type: 'string' },
        },
      },
      UpdateUp3: { allOf: [{ $ref: '#/components/schemas/CreateUp3' }] },
      AssetCategory: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
        },
      },
      CreateAssetCategory: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' }, description: { type: 'string', nullable: true } },
      },
      UpdateAssetCategory: { allOf: [{ $ref: '#/components/schemas/CreateAssetCategory' }] },
      AssetTypeRef: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          assetCategoryId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
        },
      },
      CreateAssetTypeRef: {
        type: 'object',
        required: ['assetCategoryId', 'name'],
        properties: {
          assetCategoryId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
        },
      },
      UpdateAssetTypeRef: { allOf: [{ $ref: '#/components/schemas/CreateAssetTypeRef' }] },
      CreateTicket: {
        type: 'object',
        required: ['siteId'],
        properties: {
          siteId: { type: 'string', format: 'uuid', description: 'Gardu/Site id (alias: locationId)' },
          ticketNumber: { type: 'string', nullable: true, description: 'Auto-generated if omitted' },
          category: { type: 'string', nullable: true },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
          assignedTo: { type: 'string', format: 'uuid', nullable: true },
          notes: { type: 'string', nullable: true },
        },
      },
      UpdateTicket: {
        type: 'object',
        properties: {
          category: { type: 'string', nullable: true },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          status: { type: 'string', enum: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] },
          assignedTo: { type: 'string', format: 'uuid', nullable: true },
          notes: { type: 'string', nullable: true },
        },
      },
      Ticket: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          locationId: { type: 'string', format: 'uuid' },
          ticketNumber: { type: 'string' },
          category: { type: 'string', nullable: true },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          status: { type: 'string', enum: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] },
          assignedTo: { type: 'string', format: 'uuid', nullable: true },
        },
      },
      PerformanceDaily: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          locationId: { type: 'string', format: 'uuid' },
          performanceDate: { type: 'string', format: 'date' },
          performanceStatus: { type: 'integer', enum: [0, 1], description: '1=Berhasil, 0=Gagal' },
          score: { type: 'integer', nullable: true, minimum: 0, maximum: 100 },
        },
      },
      AuditLog: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          entityType: { type: 'string' },
          entityId: { type: 'string', format: 'uuid' },
          action: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE'] },
          oldValue: { type: 'string', nullable: true },
          newValue: { type: 'string', nullable: true },
          performedBy: { type: 'string', format: 'uuid', nullable: true },
          performedAt: { type: 'string', format: 'date-time' },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid', description: 'Recipient' },
          type: {
            type: 'string',
            enum: [
              'TASK_ASSIGNED',
              'REPORT_SUBMITTED',
              'REPORT_APPROVED',
              'REPORT_REJECTED',
              'REVISION_REQUESTED',
              'TICKET_CREATED',
              'TICKET_CLOSED',
            ],
          },
          title: { type: 'string' },
          body: { type: 'string' },
          entityType: { type: 'string', nullable: true, description: 'Source entity for deep-link' },
          entityId: { type: 'string', format: 'uuid', nullable: true },
          data: { type: 'object', nullable: true, description: 'Deep-link payload (JSON)' },
          readAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    ...crudPaths({
      base: '/organizations',
      tag: 'Organizations',
      name: 'organization',
      createRef: '#/components/schemas/CreateOrganization',
      updateRef: '#/components/schemas/UpdateOrganization',
      entityRef: '#/components/schemas/Organization',
      writeRoles: 'SUPER_ADMIN',
    }),
    ...crudPaths({
      base: '/up3s',
      tag: 'UP3',
      name: 'UP3',
      createRef: '#/components/schemas/CreateUp3',
      updateRef: '#/components/schemas/UpdateUp3',
      entityRef: '#/components/schemas/Up3',
      writeRoles: 'SUPER_ADMIN, ADMIN',
      listParams: [{ in: 'query', name: 'rtuppId', schema: { type: 'string' } }],
    }),
    ...crudPaths({
      base: '/asset-categories',
      tag: 'Asset Categories',
      name: 'asset category',
      createRef: '#/components/schemas/CreateAssetCategory',
      updateRef: '#/components/schemas/UpdateAssetCategory',
      entityRef: '#/components/schemas/AssetCategory',
      writeRoles: 'SUPER_ADMIN, ADMIN',
    }),
    ...crudPaths({
      base: '/asset-types',
      tag: 'Asset Types',
      name: 'asset type',
      createRef: '#/components/schemas/CreateAssetTypeRef',
      updateRef: '#/components/schemas/UpdateAssetTypeRef',
      entityRef: '#/components/schemas/AssetTypeRef',
      writeRoles: 'SUPER_ADMIN, ADMIN',
      listParams: [{ in: 'query', name: 'assetCategoryId', schema: { type: 'string' } }],
    }),
    ...crudPaths({
      base: '/locations',
      tag: 'Locations',
      name: 'location',
      createRef: '#/components/schemas/CreateLocation',
      updateRef: '#/components/schemas/UpdateLocation',
      entityRef: '#/components/schemas/Location',
      writeRoles: 'SUPERADMIN, ADMIN',
      listParams: [{ in: 'query', name: 'type', schema: { type: 'string', enum: ['GI', 'GH', 'GARDU'] } }],
    }),
    ...crudPaths({
      base: '/feeders',
      tag: 'Feeders',
      name: 'feeder',
      createRef: '#/components/schemas/CreateFeeder',
      updateRef: '#/components/schemas/UpdateFeeder',
      entityRef: '#/components/schemas/Feeder',
      writeRoles: 'SUPERADMIN, ADMIN',
      listParams: [{ in: 'query', name: 'locationId', schema: { type: 'string' } }],
    }),
    ...crudPaths({
      base: '/assets',
      tag: 'Assets',
      name: 'asset',
      createRef: '#/components/schemas/CreateAsset',
      updateRef: '#/components/schemas/UpdateAsset',
      entityRef: '#/components/schemas/Asset',
      writeRoles: 'SUPER_ADMIN, ADMIN',
      listParams: [
        {
          in: 'query',
          name: 'assetType',
          schema: { type: 'string', enum: ['RTU', 'FDI', 'RECTIFIER', 'BATTERY_BANK', 'ROUTER', 'MODEM', 'RADIO'] },
        },
        { in: 'query', name: 'locationId', schema: { type: 'string' } },
        { in: 'query', name: 'status', schema: { type: 'string', enum: ['ACTIVE', 'WARNING', 'DAMAGED', 'RETIRED'] } },
        { in: 'query', name: 'operState', schema: { type: 'string', enum: ['UP', 'DOWN'] }, description: 'Live SCADA comm state' },
      ],
    }),
    '/assets/scada/summary': {
      get: {
        tags: ['Assets'],
        summary: 'Live RTU communication-state summary (UP/DOWN snapshot)',
        description:
          'Aggregate counts from the live SCADA snapshot maintained by POST /imports/scada/rtu-state. ' +
          'Returns { total, up, down, unknown, availability } where availability = up/(up+down)*100.',
        security: bearerAuth,
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    // SIM cards — nested list/create + flat update/delete (TDD_API §8)
    '/assets/{assetId}/sim-cards': {
      get: {
        tags: ['Asset SIM Cards'],
        summary: 'List SIM cards of an asset',
        security: bearerAuth,
        parameters: [{ in: 'path', name: 'assetId', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
      post: {
        tags: ['Asset SIM Cards'],
        summary: 'Add SIM card to asset (roles: SUPER_ADMIN, ADMIN)',
        security: bearerAuth,
        parameters: [{ in: 'path', name: 'assetId', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateSimCard' } } },
        },
        responses: { 201: { description: 'Created' }, ...stdErrors },
      },
    },
    '/sim-cards/{id}': {
      put: {
        tags: ['Asset SIM Cards'],
        summary: 'Update SIM card (roles: SUPER_ADMIN, ADMIN)',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateSimCard' } } },
        },
        responses: { 200: { description: 'Updated' }, ...stdErrors },
      },
      delete: {
        tags: ['Asset SIM Cards'],
        summary: 'Delete SIM card (roles: SUPER_ADMIN, ADMIN)',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'Deleted' }, ...stdErrors },
      },
    },
    ...crudPaths({
      base: '/communication-media',
      tag: 'Communication Media',
      name: 'communication media',
      createRef: '#/components/schemas/CreateCommunicationMedia',
      updateRef: '#/components/schemas/UpdateCommunicationMedia',
      entityRef: '#/components/schemas/CommunicationMedia',
      writeRoles: 'SUPER_ADMIN, ADMIN',
      listParams: [
        { in: 'query', name: 'locationId', schema: { type: 'string' } },
        {
          in: 'query',
          name: 'mediaType',
          schema: { type: 'string', enum: ['GSM_4G', 'GSM_2G', 'RADIO_DATA', 'FO', 'ICON_GSM', 'ICON_IPVPN'] },
        },
      ],
    }),
    // ── Inspections (Sprint 2) ──
    '/inspections': {
      get: {
        tags: ['Inspections'],
        summary: 'List inspections',
        security: bearerAuth,
        parameters: listQueryParams([{ in: 'query', name: 'locationId', schema: { type: 'string' } }]),
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
      post: {
        tags: ['Inspections'],
        summary: 'Create inspection (any authenticated role; inspector = current user)',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateInspection' } } },
        },
        responses: { 201: { description: 'Created' }, ...stdErrors },
      },
    },
    '/inspections/{id}': {
      get: {
        tags: ['Inspections'],
        summary: 'Get inspection (with findings + photos)',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    '/inspections/{id}/findings': {
      post: {
        tags: ['Inspections'],
        summary: 'Add finding to inspection',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateFinding' } } },
        },
        responses: { 201: { description: 'Created' }, ...stdErrors },
      },
    },
    '/findings/{id}/photos': {
      post: {
        tags: ['Inspections'],
        summary: 'Upload photo to a finding (multipart/form-data)',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['photo'],
                properties: {
                  photo: { type: 'string', format: 'binary' },
                  caption: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' }, ...stdErrors },
      },
    },
    // ── HAR (Sprint 3) ──
    '/har-reports': {
      get: {
        tags: ['HAR'],
        summary: 'List HAR reports',
        security: bearerAuth,
        parameters: listQueryParams([{ in: 'query', name: 'locationId', schema: { type: 'string' } }]),
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
      post: {
        tags: ['HAR'],
        summary: 'Create HAR report (any authenticated role)',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateHarReport' } } },
        },
        responses: { 201: { description: 'Created' }, ...stdErrors },
      },
    },
    '/har-reports/{id}': {
      get: {
        tags: ['HAR'],
        summary: 'Get HAR report (with details)',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    '/har-reports/{id}/details': {
      post: {
        tags: ['HAR'],
        summary: 'Add asset-status detail to HAR (one detail per asset per report)',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateHarDetail' } } },
        },
        responses: { 201: { description: 'Created' }, ...stdErrors },
      },
    },
    '/har-reports/{id}/details/{detailId}': {
      put: {
        tags: ['HAR'],
        summary: 'Update HAR detail (roles: SUPER_ADMIN, ADMIN)',
        security: bearerAuth,
        parameters: [
          idParam,
          { in: 'path', name: 'detailId', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateHarDetail' } } },
        },
        responses: { 200: { description: 'Updated' }, ...stdErrors },
      },
      delete: {
        tags: ['HAR'],
        summary: 'Delete HAR detail (roles: SUPER_ADMIN, ADMIN)',
        security: bearerAuth,
        parameters: [
          idParam,
          { in: 'path', name: 'detailId', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Deleted' }, ...stdErrors },
      },
    },
    // ── Documents (Sprint 4) ──
    '/documents': {
      get: {
        tags: ['Documents'],
        summary: 'List documents',
        security: bearerAuth,
        parameters: listQueryParams([
          { in: 'query', name: 'locationId', schema: { type: 'string' } },
          { in: 'query', name: 'assetId', schema: { type: 'string' } },
          {
            in: 'query',
            name: 'documentType',
            schema: {
              type: 'string',
              enum: ['PHOTO', 'BERITA_ACARA', 'MANUAL_BOOK', 'SERTIFIKAT', 'INSPECTION_DOC', 'OTHER'],
            },
          },
        ]),
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
      post: {
        tags: ['Documents'],
        summary: 'Upload document (multipart/form-data; any authenticated role)',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['documentType', 'file'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  documentType: {
                    type: 'string',
                    enum: ['PHOTO', 'BERITA_ACARA', 'MANUAL_BOOK', 'SERTIFIKAT', 'INSPECTION_DOC', 'OTHER'],
                  },
                  locationId: { type: 'string' },
                  assetId: { type: 'string' },
                  documentName: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' }, ...stdErrors },
      },
    },
    '/documents/{id}': {
      get: {
        tags: ['Documents'],
        summary: 'Get document by id',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
      delete: {
        tags: ['Documents'],
        summary: 'Soft delete document (roles: SUPER_ADMIN, ADMIN)',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'Deleted' }, ...stdErrors },
      },
    },
    // ── Reports — Enterprise Report Generator (docs/REPORT_GENERATOR.md) ──
    '/reports/generate': {
      post: {
        tags: ['Reports'],
        summary: 'Generate a report for any source × format (roles: SUPER_ADMIN, ADMIN, PETUGAS)',
        description:
          'Unified generator. sourceType ∈ LAPORAN_AWAL | LAPORAN_AKHIR | INSPECTION | HAR; format ∈ PDF | EXCEL. Produces a branded, versioned artifact recorded in generated_reports.',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sourceType', 'sourceId'],
                properties: {
                  sourceType: {
                    type: 'string',
                    enum: ['LAPORAN_AWAL', 'LAPORAN_AKHIR', 'INSPECTION', 'HAR'],
                  },
                  sourceId: { type: 'string', maxLength: 36 },
                  format: { type: 'string', enum: ['PDF', 'EXCEL'], default: 'PDF' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Generated' }, ...stdErrors },
      },
    },
    '/reports/generated/{id}/downloads': {
      get: {
        tags: ['Reports'],
        summary: 'Download history (audit trail) for a generated report',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    '/dashboard/overview': {
      get: {
        tags: ['Dashboard'],
        summary: 'Aggregate management overview (counts, breakdowns, 14-day trend, recents) in one call',
        security: bearerAuth,
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    // ── Digital Signature ──────────────────────────────────────────────────
    '/verify/{id}': {
      get: {
        tags: ['Digital Signature'],
        summary: 'PUBLIC — verify a report by its signature id (QR target). No auth.',
        parameters: [idParam],
        responses: { 200: { description: 'Verification verdict (valid/status/signatureValid/contentIntact)' }, ...stdErrors },
      },
    },
    '/verify/token': {
      post: {
        tags: ['Digital Signature'],
        summary: 'PUBLIC — verify a raw compact token (scanned QR payload). No auth.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Verification verdict' }, ...stdErrors },
      },
    },
    '/verify/public-key': {
      get: {
        tags: ['Digital Signature'],
        summary: 'PUBLIC — published Ed25519 public key + fingerprint for offline verification.',
        responses: { 200: { description: 'keyId, algorithm, publicKeyPem' } },
      },
    },
    '/reports/generated/{id}/signature': {
      get: {
        tags: ['Digital Signature'],
        summary: 'Signature metadata for a generated report (token, hashes, verify URL).',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    '/reports/signatures/{id}/revoke': {
      post: {
        tags: ['Digital Signature'],
        summary: 'Revoke a report signature (roles: SUPER_ADMIN, ADMIN).',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: {
          required: false,
          content: { 'application/json': { schema: { type: 'object', properties: { reason: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Revoked' }, ...stdErrors },
      },
    },
    '/reports/generate/inspection': {
      post: {
        tags: ['Reports'],
        summary: 'Generate Inspection PDF (roles: SUPER_ADMIN, ADMIN)',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateInspectionReport' } } },
        },
        responses: { 201: { description: 'Generated' }, ...stdErrors },
      },
    },
    '/reports/generate/har': {
      post: {
        tags: ['Reports'],
        summary: 'Generate HAR PDF (roles: SUPER_ADMIN, ADMIN)',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateHarReport' } } },
        },
        responses: { 201: { description: 'Generated' }, ...stdErrors },
      },
    },
    '/reports/generated': {
      get: {
        tags: ['Reports'],
        summary: 'List generated reports',
        security: bearerAuth,
        parameters: listQueryParams([
          { in: 'query', name: 'locationId', schema: { type: 'string' } },
          { in: 'query', name: 'reportType', schema: { type: 'string' } },
          {
            in: 'query',
            name: 'sourceType',
            schema: { type: 'string', enum: ['LAPORAN_AWAL', 'LAPORAN_AKHIR', 'INSPECTION', 'HAR'] },
          },
          { in: 'query', name: 'sourceId', schema: { type: 'string' } },
          { in: 'query', name: 'format', schema: { type: 'string', enum: ['PDF', 'EXCEL'] } },
        ]),
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    '/reports/generated/{id}/download': {
      get: {
        tags: ['Reports'],
        summary: 'Download generated report file (PDF or Excel) — records download history',
        security: bearerAuth,
        parameters: [idParam],
        responses: {
          200: { description: 'Report file (application/pdf or .xlsx)' },
          ...stdErrors,
        },
      },
    },
    // ── Import Engine (Sprint 5) — roles: SUPER_ADMIN, ADMIN ──
    '/imports/assets': {
      post: {
        tags: ['Imports'],
        summary: 'Import assets from Excel (.xlsx) — multipart/form-data',
        description:
          'Columns (header, case/space-insensitive): locationCode*, feederCode, assetType*, ' +
          'assetCode*, assetName*, brand, model, serialNumber, tahunOperasi, status, notes. ' +
          'Returns the ImportJob summary (totalRows/successRows/failedRows/status).',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: { 201: { description: 'Import finished (see summary)' }, ...stdErrors },
      },
    },
    '/imports/sites': {
      post: {
        tags: ['Imports'],
        summary: 'Import Gardu/Site from Excel (.xlsx) — multipart/form-data (alias: /imports/gardu)',
        description:
          'Columns (header, case/space-insensitive): siteCode*, siteName*, up3, address, ' +
          'latitude, longitude. Creates locations with locationType=GARDU; siteCode is globally ' +
          'unique (BR-004). Returns the ImportJob summary.',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
            },
          },
        },
        responses: { 201: { description: 'Import finished (see summary)' }, ...stdErrors },
      },
    },
    '/imports/performance': {
      post: {
        tags: ['Imports'],
        summary: 'Import Performance from Excel (.xlsx) — multipart/form-data',
        description:
          'Columns: siteCode*, performanceDate*, performanceStatus* (1=Berhasil/0=Gagal), score (0–100). ' +
          'Import is the only write path for performance (BR-010/011); upsert enforces one record per ' +
          'Gardu per date (BR-012).',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
            },
          },
        },
        responses: { 201: { description: 'Import finished (see summary)' }, ...stdErrors },
      },
    },
    '/imports/scada/rtu-state': {
      post: {
        tags: ['Imports'],
        summary: 'Import SCADA RTU live state from IFS export (.xlsx) — multipart/form-data',
        description:
          'Periodic Master-Station (IFS) export. Columns: RTU Name*, Oper State (UP/DOWN), Admin State, ' +
          'Protocol, ASDU, Address. Updates the live communication-state snapshot on EXISTING RTU assets ' +
          '(operState/adminState/commLastSeenAt); creates no assets. Rows matching no asset — or matching ' +
          'more than one — are captured in import_errors for reconciliation.',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
            },
          },
        },
        responses: { 201: { description: 'RTU state updated (see summary)' }, ...stdErrors },
      },
    },
    '/imports/jobs': {
      get: {
        tags: ['Imports'],
        summary: 'List import jobs',
        security: bearerAuth,
        parameters: listQueryParams([
          {
            in: 'query',
            name: 'status',
            schema: { type: 'string', enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'] },
          },
        ]),
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    '/imports/jobs/{id}': {
      get: {
        tags: ['Imports'],
        summary: 'Get import job summary',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    '/imports/jobs/{id}/errors': {
      get: {
        tags: ['Imports'],
        summary: 'List per-row errors of an import job',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    // ── Performance (read-only; import-only writes — BR-010/011) ──
    '/performance': {
      get: {
        tags: ['Performance'],
        summary: 'List daily performance records (read-only)',
        security: bearerAuth,
        parameters: listQueryParams([
          { in: 'query', name: 'siteId', schema: { type: 'string' } },
          { in: 'query', name: 'dateFrom', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string', format: 'date' } },
        ]),
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    '/performance/summary': {
      get: {
        tags: ['Performance'],
        summary: 'Performance summary (total/berhasil/gagal/successRate/avgScore)',
        security: bearerAuth,
        parameters: [
          { in: 'query', name: 'siteId', schema: { type: 'string' } },
          { in: 'query', name: 'dateFrom', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string', format: 'date' } },
        ],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    '/performance/{id}': {
      get: {
        tags: ['Performance'],
        summary: 'Get a performance record by id',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    // ── Tickets (EPIC-5) ──
    '/tickets': {
      get: {
        tags: ['Tickets'],
        summary: 'List tickets',
        security: bearerAuth,
        parameters: listQueryParams([
          { in: 'query', name: 'siteId', schema: { type: 'string' } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] } },
          { in: 'query', name: 'priority', schema: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] } },
          { in: 'query', name: 'assignedTo', schema: { type: 'string' } },
        ]),
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
      post: {
        tags: ['Tickets'],
        summary: 'Create ticket (roles: SUPER_ADMIN, ADMIN, PETUGAS)',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateTicket' } } },
        },
        responses: { 201: { description: 'Created' }, ...stdErrors },
      },
    },
    '/tickets/{id}': {
      get: {
        tags: ['Tickets'],
        summary: 'Get ticket by id',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
      put: {
        tags: ['Tickets'],
        summary: 'Update ticket (roles: SUPER_ADMIN, ADMIN)',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateTicket' } } },
        },
        responses: { 200: { description: 'Updated' }, ...stdErrors },
      },
      delete: {
        tags: ['Tickets'],
        summary: 'Soft delete ticket (roles: SUPER_ADMIN, ADMIN)',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'Deleted' }, ...stdErrors },
      },
    },
    '/tickets/{id}/assign': {
      post: {
        tags: ['Tickets'],
        summary: 'Assign ticket to a user (roles: SUPER_ADMIN, ADMIN)',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['assignedTo'], properties: { assignedTo: { type: 'string', format: 'uuid' } } },
            },
          },
        },
        responses: { 200: { description: 'Assigned' }, ...stdErrors },
      },
    },
    '/tickets/{id}/close': {
      post: {
        tags: ['Tickets'],
        summary: 'Close ticket (roles: SUPER_ADMIN, ADMIN)',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { notes: { type: 'string', nullable: true } } },
            },
          },
        },
        responses: { 200: { description: 'Closed' }, ...stdErrors },
      },
    },
    // ── Audit Logs (read-only, BR-018; roles: SUPER_ADMIN, ADMIN) ──
    '/audit-logs': {
      get: {
        tags: ['Audit Logs'],
        summary: 'List audit logs (read-only — immutable, BR-018)',
        security: bearerAuth,
        parameters: listQueryParams([
          { in: 'query', name: 'entityType', schema: { type: 'string' } },
          { in: 'query', name: 'entityId', schema: { type: 'string' } },
          { in: 'query', name: 'action', schema: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE'] } },
          { in: 'query', name: 'performedBy', schema: { type: 'string' } },
          { in: 'query', name: 'dateFrom', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string', format: 'date' } },
        ]),
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    '/audit-logs/{id}': {
      get: {
        tags: ['Audit Logs'],
        summary: 'Get audit log entry by id',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    // ── KPI Dashboard (Enterprise executive & operational KPIs) ──
    '/kpi/dashboard': {
      get: {
        tags: ['KPI'],
        summary: 'Full KPI dashboard — all 10 widgets in one optimized round trip',
        description:
          'Returns summary (Total/Selesai/Berjalan/Pending/Rejected), SLA completion rate, ' +
          'team performance, monthly trend, top team and top petugas. Scope is GLOBAL for ' +
          'SUPER_ADMIN and the caller’s own RTUPP for ADMIN.',
        security: bearerAuth,
        parameters: [
          { in: 'query', name: 'months', schema: { type: 'integer', default: 6, minimum: 1, maximum: 24 } },
          { in: 'query', name: 'slaHours', schema: { type: 'integer', default: 48, minimum: 1, maximum: 720 } },
          { in: 'query', name: 'topLimit', schema: { type: 'integer', default: 5, minimum: 1, maximum: 20 } },
        ],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    '/kpi/summary': {
      get: {
        tags: ['KPI'],
        summary: 'KPI summary — the 5 scalar headline widgets + completion rate',
        security: bearerAuth,
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    '/kpi/team-performance': {
      get: {
        tags: ['KPI'],
        summary: 'Per-team job totals (Top Team = first row, ordered by completed)',
        security: bearerAuth,
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    '/kpi/monthly-trend': {
      get: {
        tags: ['KPI'],
        summary: 'Monthly job trend (zero-filled over the requested window)',
        security: bearerAuth,
        parameters: [
          { in: 'query', name: 'months', schema: { type: 'integer', default: 6, minimum: 1, maximum: 24 } },
        ],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    // ── AI Integration (Sprint 6) ──
    '/ai/assets/search': {
      get: {
        tags: ['AI'],
        summary: 'AI-ready asset search by location query',
        description:
          'Resolves `q` to a location (exact code, then fuzzy code/name) and returns its assets, ' +
          'communication media, last inspection, last HAR and document count — the structured feed ' +
          'for the WhatsApp AI / dashboard / global search (TDD §15).',
        security: bearerAuth,
        parameters: [
          { in: 'query', name: 'q', required: true, schema: { type: 'string' }, example: 'KB305' },
        ],
        responses: { 200: { description: 'OK' }, ...stdErrors },
      },
    },
    // ── Notification Center (per-user inbox; any authenticated role) ──
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'List my notifications (paginated, newest first)',
        description:
          'Returns the caller’s own notifications. `meta.unread` carries the unread count ' +
          'alongside the page. Use `unreadOnly=true` to filter to unread.',
        security: bearerAuth,
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
          { in: 'query', name: 'unreadOnly', schema: { type: 'boolean', default: false } },
        ],
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: apiResponse({ type: 'array', items: { $ref: '#/components/schemas/Notification' } }),
              },
            },
          },
          ...stdErrors,
        },
      },
    },
    '/notifications/unread-count': {
      get: {
        tags: ['Notifications'],
        summary: 'My unread notification count (drives the bell badge)',
        security: bearerAuth,
        responses: { 200: { description: 'OK — { unread: number }' }, ...stdErrors },
      },
    },
    '/notifications/read-all': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark all my notifications as read',
        security: bearerAuth,
        responses: { 200: { description: 'OK — { updated: number }' }, ...stdErrors },
      },
    },
    '/notifications/{id}/read': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark a single notification as read (scoped to owner)',
        security: bearerAuth,
        parameters: [idParam],
        responses: { 200: { description: 'OK — { updated: number }' }, ...stdErrors },
      },
    },
  },
};

export default openApiSpec;
