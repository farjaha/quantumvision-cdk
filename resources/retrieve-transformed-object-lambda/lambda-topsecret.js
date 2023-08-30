const { redactApplier } = require('./helper_functions/redactApplier');

const redactFields = ["phone", "address"];

const handler = async function (event, context) {
    console.log(JSON.stringify(event, undefined, 2));

    return redactApplier(event, redactFields);
};


module.exports = { handler };