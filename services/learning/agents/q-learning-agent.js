// CryptoEdge Q-Learning Agent - FIXED
class QLearningAgent {
  constructor(config = {}) {
    this.actions = ['HOLD', 'BUY', 'SELL', 'CLOSE'];
    this.gamma = config.gamma || 0.95;
    this.epsilon = config.epsilon || 1.0;
    this.epsilonDecay = config.epsilonDecay || 0.995;
    this.epsilonMin = config.epsilonMin || 0.01;
    this.learningRate = config.learningRate || 0.1;
    this.qTable = {};
  }
  
  getStateKey(state) {
    const priceChange = Math.round((state.priceChange || 0) * 10);
    const unrealized = Math.round((state.unrealizedPnL || 0) * 10);
    const position = state.position || 0;
    return `${priceChange}_${unrealized}_${position}`;
  }
  
  getQValues(state) {
    const key = this.getStateKey(state);
    if (!this.qTable[key]) this.qTable[key] = [0, 0, 0, 0];
    return this.qTable[key];
  }
  
  chooseAction(state, training = true) {
    if (training && Math.random() < this.epsilon) {
      return Math.floor(Math.random() * this.actions.length);
    }
    const qValues = this.getQValues(state);
    return qValues.indexOf(Math.max(...qValues));
  }
  
  learn(state, action, reward, nextState) {
    const key = this.getStateKey(state);
    const nextKey = this.getStateKey(nextState);
    const currentQ = this.qTable[key]?.[action] || 0;
    const maxNextQ = Math.max(...(this.qTable[nextKey] || [0, 0, 0, 0]));
    const newQ = currentQ + this.learningRate * (reward + this.gamma * maxNextQ - currentQ);
    if (!this.qTable[key]) this.qTable[key] = [0, 0, 0, 0];
    this.qTable[key][action] = newQ;
    if (this.epsilon > this.epsilonMin) this.epsilon *= this.epsilonDecay;
  }
  
  replay(experiences) {
    for (const exp of experiences) {
      this.learn(exp.state, exp.action, exp.reward, exp.nextState || exp.state);
    }
  }
  
  getStats() {
    return { statesVisited: Object.keys(this.qTable).length, epsilon: this.epsilon.toFixed(3), actions: this.actions };
  }
}

module.exports = QLearningAgent;

if (require.main === module) {
  const agent = new QLearningAgent();
  const action = agent.chooseAction({ priceChange: 0.01, position: 0 });
  console.log('Action:', agent.actions[action]);
  console.log('Stats:', agent.getStats());
}
