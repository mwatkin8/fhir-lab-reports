function launch(){
    // Change this to the ID of the client that you registered with the SMART on FHIR authorization server.
    let clientId = "b31221cf-fef3-4266-a52c-30658f950599";

    // For demonstration purposes, if you registered a confidential client
    // you can enter its secret here. The demo app will pretend it's a confidential
    // app (in reality it cannot be confidential, since it cannot keep secrets in the
    // browser)
    let secret = null;    // set me, if confidential

    // These parameters will be received at loadPatient time in the URL
    let serviceUri = getUrlParameter("iss");
    let launchContextId = getUrlParameter("launch");
    let reportID = getUrlParameter("reportID");

    // The scopes that the app will request from the authorization server
    // encoded in a space-separated string:
    //      1. permission to read all of the patient's record
    //      2. permission to loadPatient the app in the specific context
    let scope = [
        "patient/*.read",
        "launch"
    ].join(" ");

    // Generate a unique session key string (here we just generate a random number
    // for simplicity, but this is not 100% collision-proof)
    let state = Math.round(Math.random()*100000000).toString();

    // To keep things flexible, let's construct the loadPatient URL by taking the base of the
    // current URL and replace "loadPatient.html" with "index.html".
    let launchUri = window.location.protocol + "//" + window.location.host + window.location.pathname;
    let redirectUri = launchUri.replace("launch.html","index.html");

    // FHIR Service Conformance Statement URL
    let conformanceUri = serviceUri + "/metadata";

    // Let's request the conformance statement from the SMART on FHIR API server and
    // find out the endpoint URLs for the authorization server
    $.get(conformanceUri, function(r){

        let authUri,
            tokenUri;

        let smartExtension = r.rest[0].security.extension.filter(function (e) {
            return (e.url === "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris");
        });

        smartExtension[0].extension.forEach(function(arg, index, array){
            if (arg.url === "authorize") {
                authUri = arg.valueUri;
            } else if (arg.url === "token") {
                tokenUri = arg.valueUri;
            }
        });

        // retain a couple parameters in the session for later use
        sessionStorage[state] = JSON.stringify({
            clientId: clientId,
            secret: secret,
            serviceUri: serviceUri,
            redirectUri: redirectUri,
            tokenUri: tokenUri,
            authUri: authUri,
            reportID: reportID
        });
        // finally, redirect the browser to the authorizatin server and pass the needed
        // parameters for the authorization request in the URL
        window.location.href = authUri + "?" +
            "response_type=code&" +
            "client_id=" + encodeURIComponent(clientId) + "&" +
            "scope=" + encodeURIComponent(scope) + "&" +
            "redirect_uri=" + encodeURIComponent(redirectUri) + "&" +
            "aud=" + encodeURIComponent(serviceUri) + "&" +
            "launch=" + launchContextId + "&" +
            "state=" + state
    }, "json");
}


// Convenience function for parsing of URL parameters
// based on http://www.jquerybyexample.net/2012/06/get-url-parameters-using-jquery.html
function getUrlParameter(sParam)
{
    let sPageURL = window.location.search.substring(1);
    let sURLVariables = sPageURL.split('&');
    for (let i = 0; i < sURLVariables.length; i++)
    {
        let sParameterName = sURLVariables[i].split('=');
        if (sParameterName[0] == sParam) {
            let res = sParameterName[1].replace(/\+/g, '%20');
            return decodeURIComponent(res);
        }
    }
}