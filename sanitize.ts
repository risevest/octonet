import { cloneDeep, isPlainObject, unset } from "lodash";

function deepSanitizeObj(data: object, ...paths: string[]) {
  const clone = cloneDeep(data);
  paths.forEach(p => unset(clone, p));
  Object.keys(clone).forEach(k => {
    if (typeof clone[k] === "object" && clone[k] !== null && !Array.isArray(clone[k])) {
      clone[k] = deepSanitizeObj(clone[k], ...paths);
    } else if (Array.isArray(clone[k])) {
      clone[k] = clone[k].map(i => {
        if (typeof i === "object") {
          return deepSanitizeObj(i, ...paths);
        }

        return i;
      });
    }
  });
  return clone;
}

const deeplyNestedObject = {
  a: {
    secret: "shhh",
    arr: [
      1,
      2,
      3,
      {
        secret: "shhh",
        public: "hello",
        arr: [
          1,
          2,
          3,
          {
            secret: "shhh",
            public: "hello",
            arr: [
              1,
              2,
              3,
              {
                secret: "shhh",
                public: "hello"
              },
              [1, 2, 3, {
                secret: "shhh",
                public: "hello",
                arr: [1, 2, 3, {
                    secret: "shhh",
                    public: "hello"
                }]
              }]
            ]
          }
        ]
      }
    ],
    b: {
      secret: "shhh",
      public: "hello",
      arr: [
        1,
        2,
        3,
        {
          secret: "shhh",
          public: "hello",
          arr: [
            1,
            2,
            3,
            {
              secret: "shhh",
              public: "hello",
              arr: [
                1,
                2,
                3,
                {
                  secret: "shhh",
                  public: "hello"
                }
              ]
            }
          ]
        }
      ],
      c: {
        secret: "shhh",
        public: "hello",
        arr: [
          1,
          2,
          3,
          {
            secret: "shhh",
            public: "hello",
            arr: [
              1,
              2,
              3,
              {
                secret: "shhh",
                public: "hello",
                arr: [
                  1,
                  2,
                  3,
                  {
                    secret: "shhh",
                    public: "hello"
                  }
                ]
              }
            ]
          }
        ],
        d: {
          secret: "shhh",
          public: "hello",
          arr: [
            1,
            2,
            3,
            {
              secret: "shhh",
              public: "hello",
              arr: [
                1,
                2,
                3,
                {
                  secret: "shhh",
                  public: "hello",
                  arr: [
                    1,
                    2,
                    3,
                    {
                      secret: "shhh",
                      public: "hello"
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    }
  }
};

function deepSanitizeObj2(data, ...paths) {
  const clone = cloneDeep(data); // Deep clone to avoid any reference issues

  function sanitizeNode(node: any) {
    if (isPlainObject(node)) {
      paths.forEach(path => unset(node, path));

      Object.keys(node).forEach(key => sanitizeNode(node[key]));
    } else if (Array.isArray(node)) {
      node.forEach((item: any) => sanitizeNode(item));
    }
  }

  sanitizeNode(clone);

  return clone;
}

console.time("deepSanitizeObj1");
const deep1 = deepSanitizeObj(deeplyNestedObject, "secret");
deepSanitizeObj(deeplyNestedObject, "secret");
console.timeEnd("deepSanitizeObj1");
console.log(JSON.stringify(deep1, null, 4));

console.time("deepSanitizeObj2");
const deep2 = deepSanitizeObj2(deeplyNestedObject, "secret");
console.timeEnd("deepSanitizeObj2");
console.log(JSON.stringify(deep2, null, 4));
