let express = require('express');
let bodyParser = require('body-parser');
let path = require('path');
let app = express();

// This is necessary middleware to parse JSON into the incoming request body for POST requests
app.use(bodyParser.json());

/**
 * Security Considerations:
 * - Must implement CORS in order to be called from a web browser
 */
app.use((request, response, next) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.setHeader('Access-Control-Expose-Headers', 'Origin, Accept, Content-Location, ' +
        'Location, X-Requested-With');

    // Pass to next layer of middleware
    next();
});

/**
 * Authorization.
 */
app.use((request, response, next) => {
    // Always allow OPTIONS requests as part of CORS pre-flight support.
    if (request.method === 'OPTIONS') {
        next();
        return;
    }

    let serviceHost = request.get('Host');
    let authorizationHeader = request.get('Authorization') || 'Bearer open'; // Default a token until ready to enable auth.

    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer')) {
        response.set('WWW-Authenticate', `Bearer realm="${serviceHost}", error="invalid_token", error_description="No Bearer token provided."`)
        return response.status(401).end();
    }

    let token = authorizationHeader.replace('Bearer ', '');
    let aud = `${request.protocol}://${serviceHost}${request.originalUrl}`;

    let isValid = true; // Verify token validity per https://cds-hooks.org/specification/1.0/#trusting-cds-client

    if (!isValid) {
        response.set('WWW-Authenticate', `Bearer realm="${serviceHost}", error="invalid_token", error_description="Token error description."`)
        return response.status(401).end();
    }

    // Pass to next layer of middleware
    next();
});

//-------FOR SMART LAUNCH-------
app.use(express.static(path.join(__dirname, '/part2-ehr/SMART-app/')));
app.use(express.static(path.join(__dirname, '/part1-lab/')));

app.get('/smart-launch', (request, response) => {
    console.log(request);
    response.sendFile(path.join(__dirname + '/part2-ehr/SMART-app/launch.html'));
});
app.get('/', (request, response) => {
    response.sendFile(path.join(__dirname + '/part2-ehr/SMART-app/index.html'));
});

//-------FOR LAB PAGE-------
app.get('/lab', (request, response) => {
    response.sendFile(path.join(__dirname + '/part1-lab/index.html'));
});

//-------FOR HOOKS SERVICE-------
/**
 * Discovery Endpoint:
 * - A GET request to the discovery endpoint, or URL path ending in '/cds-services'
 * - This function should respond with definitions of each CDS Service for this app in JSON format
 * - See details here: http://cds-hooks.org/specification/1.0/#discovery
 */
app.get('/cds-services', (request, response) => {

    let fhir_lab_reports = {
        hook: 'order-select',
        id: 'fhir_lab_reports',
        title: 'Hooks service endpoint for the fhir-lab-reports project',
        description: 'Service to serve cards generated by the results of lab reports as created by the fhir-lab-reports app',
        prefetch: {
            obs_pre: 'Observation?subject={{context.patientId}}&component-code=51963-7',
            hook : 'RequestGroup?subject={{context.patientId}}&code=fhir_lab_reports_response'
        }
    };

    let discoveryEndpointServices = {
        services: [ fhir_lab_reports ]
    };
    response.send(JSON.stringify(discoveryEndpointServices, null, 2));
});

/**
 * Order Select Example Service:
 * - Handles POST requests to the order-select-example endpoint
 * - This function should respond with an array of cards in JSON format for the order-select hook
 *
 * - Service purpose: determine if the medication to be ordered is in our collection of blood pressure medications,
 * then warn the ordering clinician it may increase the patient's Framingham risk and link to our SMART app
 */
app.post('/cds-services/fhir_lab_reports', (request, response) => {
    let implication = {};
    for (let i = 0; i < request.body.prefetch.obs_pre.total; i++){
        let r = request.body.prefetch.obs_pre.entry[i].resource;
        let l = [];
        r.component[0].valueCodeableConcept.coding.forEach(c => {
            l.push(c.code);
        });
        implication[r.valueString] = l;
    }
    let cardValues = request.body.prefetch.hook.entry[0].resource;
    // Parse the request body for the FHIR context provided by the EHR. In this case, the MedicationRequest/MedicationOrder resource
    let draftOrder = request.body.context.draftOrders.entry[0].resource;
    let selections = request.body.context.selections;

    // Check if a medication was chosen by the provider to be ordered
    if (['MedicationRequest', 'MedicationOrder'].includes(draftOrder.resourceType) && selections.includes(`${draftOrder.resourceType}/${draftOrder.id}`)
        && draftOrder.medicationCodeableConcept) {
        const responseCard = createMedicationResponseCard(draftOrder, implication, cardValues); // see function below for more details
        response.send(JSON.stringify(responseCard, null, 2));
    }
    response.status(200);
});

/**
 * Creates a Card array based upon the medication chosen by the provider in the request context
 * @param context - The FHIR context of the medication being ordered by the provider
 * @returns {{cards: *[]}} - Either a card with the suggestion to switch medication or a textual info card
 */
function createMedicationResponseCard(context, implication, cardValues) {
    let providerOrderedMedication = context.medicationCodeableConcept.coding[0].code;
    let indicator = 'info';
    if (cardValues.action[0].priority === 'urgent'){
        indicator = 'warning'
    }
    let report_id = cardValues.action[0].action[0].prefix;
    for (let key in implication) {
        if (implication[key].includes(providerOrderedMedication)){
        return {
            cards: [
                {
                    summary: 'Risk detected',
                    indicator: indicator,
                    source: {
                        "label": cardValues.action[0].documentation[0].label
                    },
                    links: [
                        {
                            label: cardValues.action[0].action[0].title,
                            url: cardValues.action[0].action[0].code[0].text + '?reportID=' + report_id,
                            type: cardValues.action[0].action[0].description
                        }
                    ],
                    detail: key  + '\n\nUse the app to view the responsible lab report and additional details.'
                }
            ]
        }
    }
    }
}

// Here is where we define the port for the localhost server to setup
app.listen(3000);