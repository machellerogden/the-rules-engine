export class Fact {
    static idCounter = 0;

    constructor(data) {
        if (!data.type) {
            throw new Error("Fact must have a 'type' property.");
        }
        this.data = data;
        this.id = Fact.idCounter++; // unique ID per fact instance
        this.recency = 0;          // track order of insertion/updates
    }
}
