export const shuffleArray = <T>(array: readonly T[]) => {
    const oldArray = [...array];
    const newArray: T[] = [];

    while (oldArray.length) {
        const index = Math.floor(Math.random() * oldArray.length);
        newArray.push(oldArray.splice(index, 1)[0]);
    }

    return newArray;
};
