#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { QuantumvisionCdkStack } from '../lib/quantumvision-cdk-stack';

const app = new cdk.App();
new QuantumvisionCdkStack(app, 'QuantumvisionCdkStack');
