class Console{

    log(obj: {}){
  const filtered = Object.fromEntries(
    Object.entries(obj).filter(([key, value]) => typeof value !== 'function')
  );
  console.log(filtered);
};

}



const cons = new Console();