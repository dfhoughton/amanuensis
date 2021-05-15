/*
Some utility functions for cloning state and diffing state
*/

// make a deep copy of an object, possibly nullifying certain object keys at whatever depth they might appear
// this is meant for cloning the sorts of things that can be stored in chrome.storage.local
// this should handle all types that serialization covers
export function deepClone(obj: any, ...except: string[]): any {
  if (typeof obj === "object") {
    if (obj == null) {
      return null;
    }
    if (obj.getTime) {
      return new Date(obj.getTime());
    } else if (Array.isArray(obj)) {
      const rv: any[] = obj.slice();
      for (let i = 0; i < rv.length; i++) {
        rv[i] = deepClone(rv[i], ...except);
      }
      return rv;
    } else if (obj instanceof Set) {
      const rv = new Set();
      obj.forEach((k, _v, _s) => rv.add(deepClone(k, ...except)));
      return rv;
    } else if (obj instanceof Map) {
      const rv = new Map();
      obj.forEach((v, k, _m) => rv.set(k, deepClone(v, ...except)));
      return rv;
    } else {
      const rv: { [key: string]: any } = {};
      for (const [k, v] of Object.entries(obj)) {
        if (except.indexOf(k) === -1) {
          rv[k] = deepClone(v, ...except);
        }
      }
      return rv;
    }
  } else {
    return obj;
  }
}

// to find whether there has been any change since the last save, possibly ignoring certain object keys at whatever depth they might appear
// this is meant for comparing the sorts of things that can be stored in chrome.storage.local
// this should handle all the types that serialization covers
export function anyDifference(
  obj1: any,
  obj2: any,
  ...except: string[]
): boolean {
  if (Object.is(obj1, obj2)) {
    return false;
  }
  const type1 = typeof obj1;
  if (type1 !== typeof obj2) {
    return true;
  }
  if (type1 === "object") {
    if ((obj1 == null) !== (obj2 == null)) {
      return true;
    }
    if (obj1 == null) {
      return false;
    }
    if (obj1.getTime ^ obj2.getTime) {
      return true;
    }
    if (obj1.getTime) {
      return obj1.getTime() !== obj2.getTime();
    }
    if (Array.isArray(obj1)) {
      if (obj1.length !== obj2.length) {
        return true;
      }
      for (let i = 0; i < obj1.length; i++) {
        if (anyDifference(obj1[i], obj2[i], ...except)) {
          return true;
        }
      }
      return false;
    }
    if (obj1 instanceof Set) {
      if (obj2 instanceof Set) {
        if (obj1.size === obj2.size) {
          for (const v of obj1) {
            if (!obj2.has(v)) {
              return true;
            }
          }
          return false;
        }
      }
      return true;
    }
    if (obj1 instanceof Map) {
      if (obj2 instanceof Map) {
        if (obj1.size === obj2.size) {
          for (const [k, v] of obj1) {
            if (anyDifference(v, obj2.get(k), ...except)) {
              return true;
            }
          }
          return false;
        }
      }
      return true;
    }
    const entries1 = Object.entries(obj1);
    if (entries1.length !== Object.keys(obj2).length) {
      return true;
    }
    for (const [k, v] of entries1) {
      if (except.indexOf(k) === -1) {
        if (anyDifference(v, obj2[k], ...except)) {
          return true;
        }
      }
    }
    return false;
  } else {
    return obj1 !== obj2;
  }
}

// do this to anything going into storage
// NOTE no cycles!
export function serialize(obj: any, ...except: string[]): any {
  if (typeof obj === "object") {
    if (obj == null) {
      return null;
    } else if (obj instanceof Date) {
      return { __class__: "Date", args: obj.getTime() };
    } else if (obj instanceof Set) {
      return {
        __class__: "Set",
        args: Array.from(obj).map((v) => serialize(v)),
      };
    } else if (obj instanceof Map) {
      return {
        __class__: "Map",
        args: Array.from(obj).map(([k, v]) => [serialize(k), serialize(v)]),
      };
    } else if (Array.isArray(obj)) {
      return obj.map((v) => serialize(v));
    } else {
      const rv: { [key: string]: any } = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "function") continue; // we can't serialize functions
        if (except.indexOf(k) === -1) {
          rv[k] = serialize(v);
        }
      }
      return rv;
    }
  } else {
    return obj;
  }
}

// do this to anything coming out of storage
export function deserialize(obj: any): any {
  if (typeof obj === "object") {
    if (obj == null) {
      return null;
    } else if (Array.isArray(obj)) {
      return obj.map((v) => deserialize(v));
    } else {
      switch (obj.__class__) {
        case "Date":
          return new Date(obj.args);
        case "Set":
          return new Set(deserialize(obj.args));
        case "Map":
          return new Map(deserialize(obj.args));
        default:
          const rv: { [key: string]: any } = {};
          for (const [k, v] of Object.entries(obj)) {
            rv[k] = deserialize(v);
          }
          return rv;
      }
    }
  } else {
    return obj;
  }
}
