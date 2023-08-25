// Function to iterate through data array and change each field that matches the fieldsToRedact and replace it with '*'
function redactData(dataArray, fieldsToRedact) {
    const redactedArray = dataArray.map((item) => {
        const redactedItem = { ...item };
        for (const field of fieldsToRedact) {
            if (redactedItem[field] !== undefined) {
                const fieldValue = String(redactedItem[field]);
                redactedItem[field] = '*'.repeat(fieldValue.length);
            }
        }
        return redactedItem;
    });
    return redactedArray;
}

module.exports = { redactData }