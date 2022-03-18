// const _groupBy = <T, K extends keyof any>(list: T[], getKey: (item: T) => K) => {
//   list.reduce((previous, currentItem) => {
//     const group = getKey(currentItem);
//     // eslint-disable-next-line no-param-reassign
//     if (!previous[group]) previous[group] = [];
//     previous[group].push(currentItem);
//     return previous;
//   }, {} as Record<K, T[]>);
// };

// const groupBy = (xs, key) => xs.reduce((rv, x) => {
//   (rv[x[key]] = rv[x[key]] || []).push(x);
//   return rv;
// }, {});

// interface Mapp {
//   [key: string]: any;
// }

// const groupBy1 = <K, V>(list: Array<K>, keyGetter: (input: V) => K): Map<K, Array<V>> => {
//   const map = new Map<K, Array<V>>();
//   list.forEach((item) => {
//     const key = keyGetter(item as unknown as V);
//     const collection = map.get(key);
//     console.log(collection);
//     console.log(map.has(key));
//     if (!collection) {
//       map.set(key, [item as unknown as V]);
//     } else {
//       collection.push(item as unknown as V);
//     }
//   });
//   return map;
// };

// interface T1 {
//   name: string,
//   key: number
// }

// interface T2 {
//   name: string,
//   hello: number
// }

// interface Person {
//   t1: T1,
//   t2: T2
// }

// const person: Person[] = [
//   {
//     t1: {
//       name: 'name',
//       key: 2,
//     },
//     t2: {
//       name: 'name',
//       hello: 2,
//     },
//   },
//   {
//     t1: {
//       name: 'name',
//       key: 2,
//     },
//     t2: {
//       name: 'name3',
//       hello: 3,
//     },
//   },
// ];
// const d = groupBy1(person, (i: Person) => i.t1);

// console.log(d);
