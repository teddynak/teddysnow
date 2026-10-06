export interface SamplePreset {
  id: string;
  name: string;
  category: string;
  filename: string;
  rulebookHint: string;
  description: string;
  content: string;
}

export const SAMPLE_FRAMEWORK_DOCS = `# Open Source Framework Documentation: Modern Web Components Guide
# Target Framework: React 18+ | Documentation Version: 2.4.0

## Component Lifecycle Overview
When writing custom data grid widgets, maintain lifecycle safety across state transitions.

\`\`\`typescript
// UserProfileWidget component definition
export class UserProfileWidget extends React.Component<Props, State> {
  // [LEGACY] Notice: backward-compatible constructor for React version 16.4
  constructor(props: Props) {
    super(props);
    this.state = { user: null, loading: true };
  }

  // Obsolete lifecycle hook flagged for replacement
  componentWillMount() {
    console.warn("Initializing component early");
    this.fetchUserProfile();
  }

  // Insecure endpoint documentation example
  fetchUserProfile() {
    const endpoint = "http://api.framework-internal.org/v1/users";
    return fetch(endpoint).then(res => res.json());
  }

  // Deprecated props sync method
  componentWillReceiveProps(nextProps: Props) {
    if (nextProps.userId !== this.props.userId) {
      this.setState({ user: nextProps.user });
    }
  }

  // Modern compliant render method
  render() {
    return <div className="profile-box">{this.state.user?.name}</div>;
  }
}
\`\`\`

## Backend API Route Handlers
Documented express route handler for processing account transfers:

\`\`\`javascript
// Unvalidated POST endpoint documentation
app.post('/api/v2/transfers', (req, res) => {
  const { amount, recipient } = req.body;
  executeTransfer(amount, recipient);
  res.json({ status: "success" });
});

// Compliant route with Zod schema validation
app.post('/api/v3/verified-transfers', (req, res) => {
  const result = transferSchema.parse(req.body); // validate input schema
  executeTransfer(result.amount, result.recipient);
  res.json({ status: "verified" });
});
\`\`\`

## Deprecated Decorators
@deprecated The BaseGridContainer export will be removed in version 4.0. Migrate to <DataGridContainer />.
`;

export const SAMPLE_SYSTEM_LOG = `2026-09-24T08:00:01Z env=prod host=api-gateway-us-east-1 service=ingress
2026-09-24T08:00:02Z INFO GET /api/v3.2/health status=200 duration=12ms tls=1.3 validated=true
2026-09-24T08:00:05Z INFO REQUEST POST /api/v1/auth/login client=mobile-app status=200 validated=true
2026-09-24T08:00:07Z WARN REQUEST POST /api/v2.1/transactions client=pos-terminal validated=false amount=450.00
2026-09-24T08:00:10Z INFO GET /api/v3.0/customers/9821 status=200 tls=1.3
2026-09-24T08:00:14Z ERROR REQUEST PUT /api/v1.4/profiles client=web-portal user=admin
2026-09-24T08:00:18Z WARN WRITE /storage/v1/blobs LEGACY bucket=archived-backups status=ok
2026-09-24T08:00:22Z INFO REQUEST DELETE /api/v3/sessions/sess_9182 status=204 validated=true
2026-09-24T08:00:25Z WARN System invoking @deprecated crypto cipher suite sslv3 on internal peer
2026-09-24T08:00:29Z INFO Insecure scrape attempted from http://telemetry.cluster.internal:9090/metrics
2026-09-24T08:00:33Z INFO REQUEST PATCH /api/v3.1/organizations/org_42 validation=true status=200
2026-09-24T08:00:36Z WARN Service billing-worker flagged as OBSOLETE by container orchestrator
2026-09-24T08:00:40Z INFO GET /api/v3/reports/daily status=200 duration=89ms tls=1.3
`;

export const SAMPLE_OPENAPI_SPEC = `swagger: "2.0"
info:
  title: Cloud Microservice Management API
  description: Public API specification for cloud service control plane
  version: "1.4.0"
schemes:
  - http
  - https
paths:
  /v1/clusters:
    get:
      summary: List active compute clusters
      deprecated: true
      responses:
        200:
          description: OK
  /v2/clusters:
    post:
      summary: Provision a new Kubernetes compute cluster
      requestBody:
        description: Target cluster provisioning parameters
        content:
          application/json:
            unvalidatedPayload: {}
      responses:
        201:
          description: Created
  /v3/nodes:
    post:
      summary: Add worker node
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [instanceType, zone]
              properties:
                instanceType: { type: string }
                zone: { type: string }
      responses:
        200:
          description: OK
`;

export const SAMPLE_COMPLIANT_RECORD = `# Framework Docs | Framework: React 18+ | env=prod
# Standards Document Compliance Verification Record

## Validated Endpoint Documentation
All service endpoints enforce schema validation, modern API versioning (3.0+), and HTTPS encryption:

\`\`\`typescript
import { z } from "zod";

const UserRequestSchema = z.object({
  username: z.string().min(3),
  role: z.enum(["admin", "operator", "auditor"]),
});

// Modern API handler with strict runtime schema validation
export async function handleCreateUser(req: Request) {
  const body = await req.json();
  const validated = UserRequestSchema.parse(body); // validated=true
  return fetch("https://secure-vault.cloud.corp/api/v3.2/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validated),
  });
}
\`\`\`

## System Log Confirmation
2026-09-24T08:15:00Z env=prod service=identity-engine host=id-node-01 tls=1.3
2026-09-24T08:15:01Z INFO GET /api/v3.4/health status=200 duration=4ms validated=true
2026-09-24T08:15:05Z INFO POST /api/v3.2/users status=201 validated=true client=admin-portal
2026-09-24T08:15:08Z INFO PUT /api/v3.1/tokens status=200 validation=enabled
`;

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: "framework-docs",
    name: "Framework Documentation",
    category: "Open Source Docs",
    filename: "react-framework-guide.md",
    rulebookHint: "Open Source Framework Documentation Auditor",
    description: "React component guide with outdated React 16.4, deprecated componentWillMount, unvalidated route handlers, and insecure HTTP URLs.",
    content: SAMPLE_FRAMEWORK_DOCS,
  },
  {
    id: "system-logs",
    name: "System Audit Logs",
    category: "System Logs",
    filename: "platform-system.log",
    rulebookHint: "Platform log compliance",
    description: "Production gateway logs with outdated api/v1 & api/v2.1, missing validation flags on POST/PUT, deprecated tags, and insecure protocols.",
    content: SAMPLE_SYSTEM_LOG,
  },
  {
    id: "openapi-spec",
    name: "OpenAPI / Swagger Spec",
    category: "API Contracts",
    filename: "service-spec.yaml",
    rulebookHint: "API & OpenAPI Spec Compliance",
    description: "Swagger 2.0 specification containing deprecated endpoints, missing request payload validation schemas, and insecure http schemes.",
    content: SAMPLE_OPENAPI_SPEC,
  },
  {
    id: "compliant-doc",
    name: "100% Compliant Record",
    category: "Golden Sample",
    filename: "compliant-service-doc.md",
    rulebookHint: "Open Source Framework Documentation Auditor",
    description: "A flawless document that fully satisfies all rules: modern API versions, required validation flags, active tags, and HTTPS encryption.",
    content: SAMPLE_COMPLIANT_RECORD,
  },
];
