function redactData(dataArray, fieldsToRedact) {
    return dataArray.map((item) => {
        const redactedItem = { ...item };
        for (const field of fieldsToRedact) {
            if (redactedItem[field] !== undefined) {
                const fieldValue = String(redactedItem[field]);
                redactedItem[field] = '*'.repeat(fieldValue.length);
            }
        }
        return redactedItem;
    });
}

module.exports = { redactData }