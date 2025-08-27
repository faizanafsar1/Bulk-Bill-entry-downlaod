import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useEffect, useState } from "react";

function App() {
  const [defaultNo, setDefaultNo] = useState();
  const [rows, setRows] = useState(() => {
    const rowsInLocalStorage = localStorage.getItem("rows");
    return rowsInLocalStorage ? Number(rowsInLocalStorage) : 30;
  });

  const [data, setData] = useState({
    utility: "",
    company: "",
    consumerNo: Array(rows).fill(""), // 30 empty strings
    mobileNo: Array(rows).fill(""),
  });

  // handle consumer number change
  const handleConsumerChange = (value, i) => {
    setData((prev) => {
      const newConsumer = [...prev.consumerNo];
      newConsumer[i] = value;
      return { ...prev, consumerNo: newConsumer };
    });
  };
  // handle mobile number change
  const handleMobNoChange = (value, i) => {
    setData((prev) => {
      const newMobNo = [...prev.mobileNo];
      newMobNo[i] = value;
      return { ...prev, mobileNo: newMobNo };
    });
  };

  const handleSubmit = () => {
    let content = "UTILITY,COMPANY,CONSUMER NO,MOBILE NUMBER\n";

    const entries = [];
    for (let i = 0; i < rows + 1; i++) {
      if (data.consumerNo[i]) {
        let entry = `${data.utility},${data.company.toUpperCase()},${data.consumerNo[i]},${data.mobileNo[i]}`;
        entries.splice(i, 0, entry);
      }
    }
    content += entries.join("\n");

    const blob = new Blob([content], { type: "plain/text" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const name = Math.random();
    link.download = `${name}.txt`;
    link.click();

    localStorage.clear();
    setData({
      utility: "",
      company: "",
      consumerNo: Array(Number(rows)).fill(""),
      mobileNo: Array(Number(rows)).fill(""),
    });
    setRows(30);
  };
  const resetForm = () => {
    const confirmed = window.confirm("Are you sure ?");
    if (confirmed) {
      localStorage.clear();
      setData({
        utility: "",
        company: "",
        consumerNo: Array(Number(rows)).fill(""),
        mobileNo: Array(Number(rows)).fill(""),
      });
      setRows(30);
    }
  };

  useEffect(() => {
    const handleLocalStorageData = () => {
      const utility = localStorage.getItem("utility");
      const company = localStorage.getItem("company");
      const newCons = [...data.consumerNo];
      const newMob = [...data.mobileNo];
      for (let x = 0; x < rows + 1; x++) {
        const cons = localStorage.getItem(`${x}consumer`);
        const mob = localStorage.getItem(`${x}mobile`);
        if (cons) newCons[x] = cons;
        if (mob) newMob[x] = mob;
      }
      setData({
        utility: utility,
        company: company,
        consumerNo: newCons,
        mobileNo: newMob,
      });
    };
    handleLocalStorageData();
  }, [rows]);

  const handleDefaultMobNo = () => {
    if (!defaultNo) return;
    for (let i = 0; i < rows + 1; i++) {
      if (!data.mobileNo[i]) {
        localStorage.setItem(`${i}mobile`, defaultNo);

        setData((prev) => {
          const defaultMob = [...prev.mobileNo];
          defaultMob[i] = defaultNo;
          return {
            ...prev,
            mobileNo: defaultMob,
          };
        });
      }
    }
  };

  const handleMobileReset = () => {
    for (let i = 0; i < rows + 1; i++) {
      setDefaultNo("");
      if (data.mobileNo[i]) {
        localStorage.setItem(`${i}mobile`, "");
        setData((prev) => {
          const defaultMob = [...prev.mobileNo];
          defaultMob[i] = "";
          return {
            ...prev,
            mobileNo: defaultMob,
          };
        });
      }
    }
  };
  return (
    <section className=" pt-10 justify-items-center">
      <h1 className=" text-2xl mb-5 text-center">Download Bulk Entry File For EasyPaisa</h1>
      <div className="flex  gap-5 m-5  w-fit h-fit">
        <button
          onClick={() => resetForm()}
          className="flex  p-2 py-1.5 hover:bg-gray-100 cursor-pointer focus:shadow-inner shadow-black/50 mx-auto justify-self-center border border-gray-600 rounded-lg "
        >
          Reset Form
        </button>
        <select
          value={rows}
          onChange={(e) => {
            setRows(() => e.target.value);
            localStorage.setItem("rows", e.target.value);
          }}
          className="border rounded-md px-2 py-1  "
        >
          <option value={30}>Rows 30</option>
          <option value={60}>Rows 60</option>
          <option value={80}>Rows 80</option>
        </select>
      </div>
      <div className="flex gap-5 w-5xl ">
        <form className="flex flex-3 *:capitalize flex-col gap-2 border rounded-lg w-3xl p-2 ">
          <div className=" bg-gray-200 flex p-2 rounded-lg ">
            <label className="ml-10">Utility</label>
            <label className="ml-52 mr-44">Company</label>
            <label className="mr-36">Consumer No</label>
            <label>Mobile No</label>
          </div>

          <div className="grid grid-cols-[20px_repeat(4,1fr)]  gap-x-5 gap-y-3 *:capitalize justify-between">
            {/* Utility */}
            <span className="m-auto text-lg shadow-inner  border-r rounded-md px-1.5 py-0.5 flex  ">1</span>
            <select
              value={data.utility}
              onChange={(e) =>
                setData((prev) => {
                  localStorage.setItem("utility", e.target.value);
                  return { ...prev, utility: e.target.value };
                })
              }
              className="border rounded-md px-2 py-1 "
            >
              <option>select one</option>
              <option value="Electricity">electricity</option>
              <option value="Gas">gas</option>
            </select>

            {/* Company */}
            <select
              value={data.company}
              onChange={(e) =>
                setData((prev) => {
                  localStorage.setItem("company", e.target.value);
                  return { ...prev, company: e.target.value };
                })
              }
              className="border rounded-md px-2 py-1 "
            >
              <option>select company</option>
              {data.utility === "Electricity" && (
                <>
                  <option value="Iesco">IESCO</option>
                  <option value="Fesco">FESCO</option>
                </>
              )}
              {data.utility === "Gas" && <option value="SNGPL">SNGPL</option>}
            </select>

            <input
              className="border rounded-md px-2 py-1"
              onChange={(e) => {
                handleConsumerChange(e.target.value, 0);
                localStorage.setItem("0consumer", e.target.value);
              }}
              type="number"
              value={data.consumerNo[0]}
            />
            <input
              className="border rounded-md px-2 py-1 "
              placeholder="03xxxxxxxxx"
              type="number"
              value={data.mobileNo[0]}
              onChange={(e) => {
                handleMobNoChange(e.target.value, 0);
                localStorage.setItem("0mobile", e.target.value);
              }}
            />

            {Array.from({ length: rows }).map((_, i) => (
              <React.Fragment key={i + 1}>
                <span className="m-auto text-lg shadow-inner  border-r rounded-md px-1.5 py-0.5 flex  ">{i + 2}</span>

                <span className="border rounded-md px-2 py-1 ">{data.utility}</span>
                <span className="border rounded-md px-2 py-1 ">{data.company}</span>
                <input
                  className="border rounded-md px-2 py-1 "
                  type="number"
                  value={data.consumerNo[i + 1]}
                  onChange={(e) => {
                    handleConsumerChange(e.target.value, i + 1);
                    localStorage.setItem(`${i + 1}consumer`, e.target.value);
                  }}
                />
                <input
                  className="border rounded-md px-2 py-1 "
                  placeholder="03xxxxxxxxx"
                  type="number"
                  value={data.mobileNo[i + 1]}
                  onChange={(e) => {
                    handleMobNoChange(e.target.value, i + 1);
                    localStorage.setItem(`${i + 1}mobile`, e.target.value);
                  }}
                />
              </React.Fragment>
            ))}
          </div>
        </form>
      </div>
      <div className="border flex flex-col gap-2 text-center  rounded-lg p-5 m-5">
        <div>
          <h3 className="">Set Number for Empty Fields</h3>
        </div>
        <div className="flex gap-2">
          <input
            className="border rounded-md px-2 py-1"
            value={defaultNo}
            onChange={(e) => setDefaultNo(() => e.target.value)}
            type="number"
          />
          <button
            onClick={() => handleDefaultMobNo()}
            className="flex text-2xl   hover:bg-gray-100 cursor-pointer focus:shadow-inner shadow-black/50 mx-auto justify-self-center border border-gray-300 rounded-lg "
          >
            <FontAwesomeIcon className="m-auto text-green-500  " icon={faCheck}></FontAwesomeIcon>
          </button>
          <button
            onClick={() => handleMobileReset()}
            className="flex p-2 py-1.5 hover:bg-gray-100 cursor-pointer focus:shadow-inner shadow-black/50 mx-auto justify-self-center border border-gray-600 rounded-lg "
          >
            Reset Mobile Number
          </button>
        </div>
      </div>
      <button
        onClick={() => handleSubmit()}
        className="flex m-5 p-2 py-1.5 hover:bg-gray-100 cursor-pointer focus:shadow-inner shadow-black/50 mx-auto justify-self-center border border-gray-600 rounded-lg "
      >
        Download File
      </button>
    </section>
  );
}

export default App;
